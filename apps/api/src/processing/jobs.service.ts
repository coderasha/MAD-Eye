import { randomUUID } from "node:crypto";
import { IMPLEMENTED_PIPELINES, jobMessageSchema, type JobMessage } from "@madeye/shared-types";
import { ConflictException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService, JobQueue } from "../infra/services.js";

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
  ) {}

  async create(input: { tenantId: string; userId: string; documentId: string; pipeline: string; idempotencyKey?: string; correlationId: string }) {
    if (!IMPLEMENTED_PIPELINES.includes(input.pipeline as (typeof IMPLEMENTED_PIPELINES)[number])) {
      throw new ConflictException({
        code: "CAPABILITY_NOT_IMPLEMENTED",
        message: "That pipeline is not implemented. MAD-EYE will not invent recognition output.",
        details: { pipeline: input.pipeline, implemented: [...IMPLEMENTED_PIPELINES] },
      });
    }
    const pipeline = input.pipeline as (typeof IMPLEMENTED_PIPELINES)[number];
    if (input.idempotencyKey) {
      const existing = await this.prisma.tenant(input.tenantId, (tx) =>
        tx.processingJob.findUnique({ where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey! } } }),
      );
      if (existing) return this.present(existing);
    }
    const document = await this.prisma.tenant(input.tenantId, (tx) =>
      tx.document.findFirst({ where: { id: input.documentId, tenantId: input.tenantId, deletedAt: null } }),
    );
    if (!document) throw new NotFoundException({ code: "NOT_FOUND", message: "Document not found" });
    const jobId = randomUUID();
    const message: JobMessage = {
      jobId,
      tenantId: input.tenantId,
      documentId: input.documentId,
      pipeline,
      correlationId: input.correlationId,
    };
    jobMessageSchema.parse(message);
    const job = await this.prisma.tenant(input.tenantId, async (tx) => {
      const created = await tx.processingJob.create({
        data: {
          id: jobId,
          tenantId: input.tenantId,
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
          pipeline,
          status: "PENDING",
          requestedById: input.userId,
          correlationId: input.correlationId,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.userId,
          action: "job.created",
          targetType: "processing_job",
          targetId: jobId,
          correlationId: input.correlationId,
          metadata: { pipeline },
        },
      });
      return created;
    });
    try {
      await this.queue.publish(message);
    } catch {
      throw new HttpException({ code: "QUEUE_UNAVAILABLE", message: "The job was stored and can be requeued", details: { jobId } }, 503);
    }
    const queued = await this.prisma.tenant(input.tenantId, (tx) =>
      tx.processingJob.update({
        where: { id: jobId },
        data: { status: "QUEUED", document: { update: { status: "QUEUED" } } },
      }),
    );
    return this.present(queued);
  }

  async get(tenantId: string, jobId: string) {
    const job = await this.prisma.tenant(tenantId, (tx) =>
      tx.processingJob.findFirst({ where: { id: jobId, tenantId }, include: { stages: true } }),
    );
    if (!job) throw new NotFoundException({ code: "NOT_FOUND", message: "Job not found" });
    return { ...this.present(job), stages: job.stages.map((stage) => ({ name: stage.name, status: stage.status, detail: stage.detail })) };
  }

  async requeue(tenantId: string, jobId: string) {
    const job = await this.prisma.tenant(tenantId, (tx) => tx.processingJob.findFirst({ where: { id: jobId, tenantId } }));
    if (!job) throw new NotFoundException({ code: "NOT_FOUND", message: "Job not found" });
    if (job.status !== "PENDING" && job.status !== "FAILED") {
      throw new ConflictException({ code: "JOB_NOT_REQUEUABLE", message: "Only pending or failed jobs can be requeued" });
    }
    const message: JobMessage = {
      jobId: job.id,
      tenantId: job.tenantId,
      documentId: job.documentId,
      pipeline: job.pipeline === "recognise" ? "recognise" : "preprocess",
      correlationId: job.correlationId,
    };
    await this.queue.publish(message);
    const queued = await this.prisma.tenant(tenantId, (tx) =>
      tx.processingJob.update({ where: { id: job.id }, data: { status: "QUEUED", errorCode: null, errorMessage: null } }),
    );
    return this.present(queued);
  }

  private present(job: { id: string; documentId: string; pipeline: string; status: string; errorCode: string | null; createdAt: Date; finishedAt: Date | null }) {
    return {
      id: job.id,
      documentId: job.documentId,
      pipeline: job.pipeline,
      status: job.status,
      errorCode: job.errorCode,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    };
  }
}
