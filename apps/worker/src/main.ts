import { createHash } from "node:crypto";
import { createPrismaClient, type PrismaClient } from "@madeye/database";
import { decryptSecret, hmacSha256, pageObjectKey } from "@madeye/config";
import { PROCESSING_QUEUE, jobMessageSchema, preprocessResponseSchema, webhookJobEventSchema } from "@madeye/shared-types";
import amqp from "amqplib";
import { Client } from "minio";
import { z } from "zod";
import { summarise } from "./apply.js";
import { fetchRecognition, persistRecognition } from "./recognise.js";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  INTELLIGENCE_BASE_URL: z.string().url(),
  WEBHOOK_ENCRYPTION_KEY: z.string().min(1),
});

const env = envSchema.parse(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);
const endpoint = new URL(env.S3_ENDPOINT);
const storage = new Client({
  endPoint: endpoint.hostname,
  port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80,
  useSSL: endpoint.protocol === "https:",
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
  region: env.S3_REGION,
});

async function readObject(key: string): Promise<Buffer> {
  const stream = await storage.getObject(env.S3_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function preprocess(bytes: Buffer, mediaType: string, correlationId: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mediaType }), "document.bin");
  const response = await fetch(`${env.INTELLIGENCE_BASE_URL}/v1/preprocess`, {
    method: "POST",
    body: form,
    headers: { "x-correlation-id": correlationId },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`INTELLIGENCE_${response.status}`);
  }
  return preprocessResponseSchema.parse(await response.json());
}

async function handle(raw: unknown): Promise<void> {
  const message = jobMessageSchema.parse(raw);
  const job = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${message.tenantId}, true)`;
    return tx.processingJob.findFirst({ where: { id: message.jobId, tenantId: message.tenantId } });
  });
  if (!job || job.status === "SUCCEEDED" || job.status === "PARTIAL" || job.status === "CANCELLED") return;
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${message.tenantId}, true)`;
    return tx.processingJob.updateMany({
      where: { id: job.id, tenantId: message.tenantId, status: { in: ["QUEUED", "PENDING", "FAILED"] } },
      data: { status: "RUNNING", startedAt: new Date(), errorCode: null, errorMessage: null },
    });
  });
  if (claimed.count === 0) return;
  try {
    const asset = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${message.tenantId}, true)`;
      return tx.documentAsset.findFirst({
        where: { documentId: message.documentId, tenantId: message.tenantId, kind: "ORIGINAL" },
      });
    });
    if (!asset) throw new Error("ORIGINAL_MISSING");
    const bytes = await readObject(asset.storageKey);
    if (message.pipeline === "recognise") {
      const recognised = await fetchRecognition(env.INTELLIGENCE_BASE_URL, bytes, asset.mediaType, message.correlationId);
      const saved = await persistRecognition({
        prisma,
        storage,
        bucket: env.S3_BUCKET,
        tenantId: message.tenantId,
        documentId: message.documentId,
        jobId: job.id,
        result: recognised,
      });
      const hooks = await prisma.webhook.findMany({ where: { tenantId: message.tenantId, enabled: true } });
      const event = webhookJobEventSchema.parse({
        event: "job.completed",
        tenantId: message.tenantId,
        jobId: job.id,
        documentId: message.documentId,
        status: saved.status,
        occurredAt: new Date().toISOString(),
      });
      await deliver(prisma, hooks, event);
      return;
    }
    const result = await preprocess(bytes, asset.mediaType, message.correlationId);
    const summary = summarise(result);
    const stored = new Map<number, { key: string; byteSize: number }>();
    for (const page of result.pages) {
      if (page.status !== "COMPLETED" || !page.output) continue;
      const png = Buffer.from(page.output.primaryPngBase64, "base64");
      if (createHash("sha256").update(png).digest("hex") !== page.output.primarySha256) {
        throw new Error("DERIVATIVE_CHECKSUM");
      }
      const key = pageObjectKey(message.tenantId, message.documentId, page.pageIndex, "preprocessed");
      await storage.putObject(env.S3_BUCKET, key, png, png.length, { "Content-Type": "image/png" });
      stored.set(page.pageIndex, { key, byteSize: png.length });
    }
    const occurredAt = new Date().toISOString();
    const hooks = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${message.tenantId}, true)`;
      await tx.documentAsset.deleteMany({
        where: { tenantId: message.tenantId, documentId: message.documentId, kind: { in: ["PREPROCESSED_PAGE", "BINARIZED_PAGE"] } },
      });
      for (const page of result.pages) {
        const saved = await tx.documentPage.upsert({
          where: { documentId_pageIndex: { documentId: message.documentId, pageIndex: page.pageIndex } },
          create: {
            tenantId: message.tenantId,
            documentId: message.documentId,
            pageIndex: page.pageIndex,
            width: page.output?.width,
            height: page.output?.height,
            dpi: page.dpi ?? null,
            status: page.status === "COMPLETED" ? "COMPLETED" : "FAILED",
            errorCode: page.errorCode,
          },
          update: {
            width: page.output?.width,
            height: page.output?.height,
            dpi: page.dpi ?? null,
            status: page.status === "COMPLETED" ? "COMPLETED" : "FAILED",
            errorCode: page.errorCode,
          },
        });
        const savedObject = stored.get(page.pageIndex);
        if (page.status === "COMPLETED" && page.output && savedObject) {
          await tx.documentAsset.create({
            data: {
              tenantId: message.tenantId,
              documentId: message.documentId,
              pageId: saved.id,
              kind: "PREPROCESSED_PAGE",
              mediaType: "image/png",
              byteSize: savedObject.byteSize,
              sha256: page.output.primarySha256,
              storageKey: savedObject.key,
            },
          });
        }
      }
      await tx.processingStage.deleteMany({ where: { jobId: job.id } });
      for (const stage of summary.stages) {
        await tx.processingStage.create({
          data: {
            tenantId: message.tenantId,
            jobId: job.id,
            name: stage.name,
            status: stage.status,
            detail: stage.detail as object,
            startedAt: new Date(),
            finishedAt: new Date(),
          },
        });
      }
      const completedPages = result.pages.filter((page) => page.status === "COMPLETED").length;
      await tx.processingJob.update({
        where: { id: job.id },
        data: { status: summary.jobStatus, finishedAt: new Date() },
      });
      await tx.document.update({
        where: { id: message.documentId },
        data: { status: summary.jobStatus, pageCount: result.pageCount },
      });
      if (completedPages > 0) {
        await tx.usageRecord.create({
          data: { tenantId: message.tenantId, metric: "pages_preprocessed", quantity: completedPages, jobId: job.id },
        });
      }
      return tx.webhook.findMany({ where: { tenantId: message.tenantId, enabled: true } });
    });
    const event = webhookJobEventSchema.parse({
      event: "job.completed",
      tenantId: message.tenantId,
      jobId: job.id,
      documentId: message.documentId,
      status: summary.jobStatus,
      occurredAt,
    });
    await deliver(prisma, hooks, event);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "JOB_FAILED";
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${message.tenantId}, true)`;
      await tx.processingJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorCode: code, errorMessage: message.pipeline === "recognise" ? "Recognition failed" : "Preprocessing failed", finishedAt: new Date() },
      });
      await tx.document.updateMany({
        where: { id: message.documentId, tenantId: message.tenantId },
        data: { status: "FAILED" },
      });
    });
  }
}

async function deliver(
  client: PrismaClient,
  hooks: { id: string; url: string; secretEncrypted: string; events: string[]; tenantId: string }[],
  event: { event: string; tenantId: string; jobId: string; documentId: string; status: string; occurredAt: string },
): Promise<void> {
  const body = JSON.stringify(event);
  for (const hook of hooks) {
    if (!hook.events.includes(event.event)) continue;
    const secret = decryptSecret(hook.secretEncrypted, env.WEBHOOK_ENCRYPTION_KEY);
    const signature = hmacSha256(secret, body);
    let succeeded = false;
    let statusCode: number | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(hook.url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-madeye-signature": signature },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = response.status;
        succeeded = response.ok;
        await client.webhookDelivery.create({
          data: { tenantId: hook.tenantId, webhookId: hook.id, event: event.event, payload: event, attempt, statusCode, succeeded },
        });
        if (succeeded) break;
      } catch {
        await client.webhookDelivery.create({
          data: { tenantId: hook.tenantId, webhookId: hook.id, event: event.event, payload: event, attempt, succeeded: false },
        });
      }
    }
  }
}

const connection = await amqp.connect(env.RABBITMQ_URL);
const channel = await connection.createChannel();
await channel.assertQueue(PROCESSING_QUEUE, { durable: true });
await channel.prefetch(2);
await channel.consume(PROCESSING_QUEUE, (message) => {
  if (!message) return;
  void handle(JSON.parse(message.content.toString("utf8")))
    .then(() => channel.ack(message))
    .catch((error: unknown) => {
      process.stderr.write(`${JSON.stringify({ level: "error", message: "worker_message_failed", name: error instanceof Error ? error.name : "Error" })}\n`);
      channel.ack(message);
    });
});
process.stdout.write(`${JSON.stringify({ level: "info", message: "worker_started", queue: PROCESSING_QUEUE })}\n`);
