import { createHash } from "node:crypto";
import type { PrismaClient } from "@madeye/database";
import { pageObjectKey } from "@madeye/config";
import { recogniseResponseSchema, type RecogniseResponse } from "@madeye/shared-types";
import type { Client } from "minio";

type Storage = Pick<Client, "putObject">;

export async function fetchRecognition(baseUrl: string, bytes: Buffer, mediaType: string, correlationId: string): Promise<RecogniseResponse> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mediaType }), "document.bin");
  const response = await fetch(`${baseUrl}/v1/recognise?labels=Invoice,GSTIN,Date`, {
    method: "POST",
    body: form,
    headers: { "x-correlation-id": correlationId },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`INTELLIGENCE_${response.status}`);
  }
  return recogniseResponseSchema.parse(await response.json());
}

export async function persistRecognition(input: {
  prisma: PrismaClient;
  storage: Storage;
  bucket: string;
  tenantId: string;
  documentId: string;
  jobId: string;
  result: RecogniseResponse;
}): Promise<{ status: "SUCCEEDED" | "PARTIAL" | "FAILED"; completedPages: number }> {
  const { prisma, storage, bucket, tenantId, documentId, jobId, result } = input;
  const stored = new Map<number, { key: string; byteSize: number }>();
  for (const page of result.pages) {
    if (page.status !== "COMPLETED" || !page.output) continue;
    const png = Buffer.from(page.output.primaryPngBase64, "base64");
    if (createHash("sha256").update(png).digest("hex") !== page.output.primarySha256) {
      throw new Error("DERIVATIVE_CHECKSUM");
    }
    const key = pageObjectKey(tenantId, documentId, page.pageIndex, "preprocessed");
    await storage.putObject(bucket, key, png, png.length, { "Content-Type": "image/png" });
    stored.set(page.pageIndex, { key, byteSize: png.length });
  }
  const completedPages = result.pages.filter((page) => page.status === "COMPLETED").length;
  const failedPages = result.pages.length - completedPages;
  const status = completedPages === 0 ? "FAILED" : failedPages > 0 ? "PARTIAL" : "SUCCEEDED";
  const needsReview = result.pages.some((page) =>
    page.lines.some((line) => line.outputState === "NEEDS_REVIEW" || line.outputState === "UNREADABLE" || line.outputState === "VALIDATION_FAILED"),
  );
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await tx.documentAsset.deleteMany({
      where: { tenantId, documentId, kind: { in: ["PREPROCESSED_PAGE", "BINARIZED_PAGE"] } },
    });
    await tx.recognitionRegion.deleteMany({ where: { tenantId, documentId, corrections: { none: {} } } });
    await tx.docTable.deleteMany({ where: { tenantId, documentId } });
    await tx.extractedField.deleteMany({ where: { tenantId, documentId } });
    const pageIds = new Map<number, string>();
    for (const page of result.pages) {
      const saved = await tx.documentPage.upsert({
        where: { documentId_pageIndex: { documentId, pageIndex: page.pageIndex } },
        create: {
          tenantId,
          documentId,
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
      pageIds.set(page.pageIndex, saved.id);
      const object = stored.get(page.pageIndex);
      if (page.status === "COMPLETED" && page.output && object) {
        await tx.documentAsset.create({
          data: {
            tenantId,
            documentId,
            pageId: saved.id,
            kind: "PREPROCESSED_PAGE",
            mediaType: "image/png",
            byteSize: object.byteSize,
            sha256: page.output.primarySha256,
            storageKey: object.key,
          },
        });
      }
    }
    const regionIds = new Map<string, string>();
    for (const page of result.pages) {
      const pageId = pageIds.get(page.pageIndex);
      if (!pageId) continue;
      for (const line of page.lines) {
        const region = await tx.recognitionRegion.create({
          data: {
            tenantId,
            documentId,
            pageId,
            jobId,
            regionIndex: line.regionIndex,
            text: line.text,
            confidence: line.confidence,
            calibrated: line.calibrated,
            outputState: line.outputState,
            bbox: line.bbox,
            configHash: result.model.version,
          },
        });
        regionIds.set(`${page.pageIndex}:${line.regionIndex}`, region.id);
      }
      for (const table of page.tables) {
        const savedTable = await tx.docTable.create({
          data: {
            tenantId,
            documentId,
            pageId,
            jobId,
            bbox: table.bbox,
            rowCount: table.rowCount,
            colCount: table.colCount,
            cells: {
              create: table.cells.map((cell) => ({
                tenantId,
                rowIndex: cell.rowIndex,
                colIndex: cell.colIndex,
                rowSpan: cell.rowSpan,
                colSpan: cell.colSpan,
                text: cell.text ?? null,
                bbox: cell.bbox,
              })),
            },
          },
        });
        void savedTable;
      }
      for (const field of page.fields) {
        const regionId = field.regionIndex == null ? null : regionIds.get(`${page.pageIndex}:${field.regionIndex}`) ?? null;
        const savedField = await tx.extractedField.create({
          data: {
            tenantId,
            documentId,
            jobId,
            fieldKey: field.fieldKey,
            valueText: field.valueText,
            confidence: field.confidence,
            calibrated: field.calibrated,
            outputState: field.outputState === "VALIDATION_FAILED" ? "VALIDATION_FAILED" : field.outputState === "UNREADABLE" ? "UNREADABLE" : field.outputState === "RECOGNISED" ? "RECOGNISED" : field.outputState === "RECOGNISED_WITH_WARNING" ? "RECOGNISED_WITH_WARNING" : "NEEDS_REVIEW",
            regionId,
            pageIndex: page.pageIndex,
          },
        });
        if (field.validationRule && field.validationPassed != null && field.validationMessage) {
          await tx.validationResult.create({
            data: {
              tenantId,
              documentId,
              jobId,
              fieldId: savedField.id,
              ruleKey: field.validationRule,
              passed: field.validationPassed,
              message: field.validationMessage,
            },
          });
        }
      }
    }
    if (needsReview) {
      await tx.reviewTask.create({
        data: {
          tenantId,
          documentId,
          jobId,
          reason: result.model.benchmarkValidated
            ? "One or more regions are below the review gate"
            : "Recognition used a model that is not benchmark-validated",
        },
      });
    }
    await tx.processingStage.deleteMany({ where: { jobId } });
    const detail = {
      contractVersion: result.contractVersion,
      pageCount: result.pageCount,
      model: result.model,
      pages: result.pages.map((page) => ({
        pageIndex: page.pageIndex,
        status: page.status,
        lineCount: page.lines.length,
        lines: page.lines.map((line) => ({
          regionIndex: line.regionIndex,
          text: line.text,
          outputState: line.outputState,
          confidence: line.confidence,
          calibrated: line.calibrated,
          benchmarkValidated: line.benchmarkValidated,
          modelCode: line.modelCode,
          modelVersion: line.modelVersion,
          bbox: line.bbox,
        })),
        tableCount: page.tables.length,
        fieldCount: page.fields.length,
      })),
    };
    for (const name of ["DETECT", "RECOGNISE", "LAYOUT", "TABLE", "EXTRACT"] as const) {
      await tx.processingStage.create({
        data: {
          tenantId,
          jobId,
          name,
          status: status === "FAILED" ? "FAILED" : "SUCCEEDED",
          detail,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });
    }
    await tx.processingJob.update({ where: { id: jobId }, data: { status, finishedAt: new Date(), errorCode: null, errorMessage: null } });
    await tx.document.update({ where: { id: documentId }, data: { status, pageCount: result.pageCount } });
    if (completedPages > 0) {
      await tx.usageRecord.create({ data: { tenantId, metric: "pages_recognised", quantity: completedPages, jobId } });
    }
  });
  return { status, completedPages };
}
