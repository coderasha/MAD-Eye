import { createHash, randomUUID } from "node:crypto";
import { extensionForMediaType, originalObjectKey } from "@madeye/config";
import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { detectMediaType, sanitizeFilename } from "../common/files.js";
import { decodeCursor, encodeCursor } from "../common/pagination.js";
import { scanBuffer } from "../common/scanner.js";
import { ENV, type Env } from "../env.js";
import { ObjectStorage, PrismaService } from "../infra/services.js";
import { log } from "../logging.js";

export interface UploadInput {
  bytes: Buffer;
  filename: string;
  metadata?: Record<string, string | number | boolean | null>;
  userId: string;
  tenantId: string;
  correlationId: string;
  ip?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async upload(input: UploadInput) {
    if (input.bytes.length > this.env.MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({ code: "FILE_TOO_LARGE", message: "The file exceeds the upload limit" });
    }
    const mediaType = detectMediaType(input.bytes);
    if (!mediaType) {
      throw new BadRequestException({ code: "UNSUPPORTED_MEDIA_TYPE", message: "Only PDF, PNG, JPEG, TIFF, and WEBP are accepted" });
    }
    const scanStatus = await this.scan(input.bytes);
    const documentId = randomUUID();
    const assetId = randomUUID();
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const storageKey = originalObjectKey(input.tenantId, documentId, extensionForMediaType(mediaType));
    const filename = sanitizeFilename(input.filename);
    await this.storage.put(storageKey, input.bytes, mediaType);
    try {
      const document = await this.prisma.tenant(input.tenantId, (tx) =>
        tx.document.create({
          data: {
            id: documentId,
            tenantId: input.tenantId,
            createdById: input.userId,
            filename,
            mediaType,
            byteSize: input.bytes.length,
            sha256,
            status: "UPLOADED",
            sourceKind: "UPLOAD",
            scanStatus,
            metadata: input.metadata,
            assets: {
              create: {
                id: assetId,
                tenantId: input.tenantId,
                kind: "ORIGINAL",
                mediaType,
                byteSize: input.bytes.length,
                sha256,
                storageKey,
              },
            },
          },
          include: { assets: true },
        }),
      );
      await this.prisma.tenant(input.tenantId, (tx) =>
        tx.auditEvent.create({
          data: {
            tenantId: input.tenantId,
            actorId: input.userId,
            action: "document.created",
            targetType: "document",
            targetId: documentId,
            correlationId: input.correlationId,
            ip: input.ip,
            metadata: { byteSize: input.bytes.length, mediaType },
          },
        }),
      );
      return this.present(document);
    } catch (error) {
      log("error", "document_row_failed_after_upload", { documentId, correlationId: input.correlationId });
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async list(tenantId: string, query: { cursor?: string; limit?: number; status?: string; q?: string }) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      throw new BadRequestException({ code: "BAD_CURSOR", message: "The page cursor is not valid" });
    }
    const rows = await this.prisma.tenant(tenantId, (tx) =>
      tx.document.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.status ? { status: query.status as never } : {}),
          ...(query.q ? { filename: { contains: query.q, mode: "insensitive" } } : {}),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: { pages: { select: { id: true, pageIndex: true, status: true, width: true, height: true } } },
      }),
    );
    const page = rows.slice(0, limit);
    const next = rows.length > limit ? page[page.length - 1] : undefined;
    return {
      data: page.map((document) => this.present(document)),
      nextCursor: next ? encodeCursor(next.createdAt, next.id) : null,
    };
  }

  async get(tenantId: string, documentId: string) {
    const document = await this.prisma.tenant(tenantId, (tx) =>
      tx.document.findFirst({
        where: { id: documentId, tenantId, deletedAt: null },
        include: {
          assets: true,
          pages: { orderBy: { pageIndex: "asc" } },
          regions: { orderBy: { regionIndex: "asc" }, include: { corrections: { orderBy: { createdAt: "asc" } } } },
          reviews: { orderBy: { createdAt: "desc" }, take: 10 },
          fields: { orderBy: { createdAt: "desc" }, take: 40 },
          tables: { include: { cells: { orderBy: [{ rowIndex: "asc" }, { colIndex: "asc" }] } } },
          jobs: { orderBy: { createdAt: "desc" }, take: 5, include: { stages: true } },
        },
      }),
    );
    if (!document) throw new NotFoundException({ code: "NOT_FOUND", message: "Document not found" });
    return {
      ...this.present(document),
      assets: document.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        mediaType: asset.mediaType,
        byteSize: asset.byteSize,
        sha256: asset.sha256,
        pageId: asset.pageId,
        createdAt: asset.createdAt,
      })),
      regions: document.regions.map((region) => ({
        id: region.id,
        pageId: region.pageId,
        regionIndex: region.regionIndex,
        text: region.text,
        confidence: region.confidence,
        calibrated: region.calibrated,
        outputState: region.outputState,
        bbox: region.bbox,
        createdAt: region.createdAt,
        corrections: region.corrections.map((correction) => ({
          id: correction.id,
          previousText: correction.previousText,
          correctedText: correction.correctedText,
          reason: correction.reason,
          createdAt: correction.createdAt,
        })),
      })),
      reviews: document.reviews.map((review) => ({
        id: review.id,
        reason: review.reason,
        status: review.status,
        createdAt: review.createdAt,
      })),
      fields: document.fields.map((field) => ({
        id: field.id,
        fieldKey: field.fieldKey,
        valueText: field.valueText,
        outputState: field.outputState,
        confidence: field.confidence,
        calibrated: field.calibrated,
        pageIndex: field.pageIndex,
        regionId: field.regionId,
      })),
      tables: document.tables.map((table) => ({
        id: table.id,
        pageId: table.pageId,
        rowCount: table.rowCount,
        colCount: table.colCount,
        bbox: table.bbox,
        cells: table.cells.map((cell) => ({
          rowIndex: cell.rowIndex,
          colIndex: cell.colIndex,
          text: cell.text,
          bbox: cell.bbox,
        })),
      })),
      jobs: document.jobs.map((job) => ({
        id: job.id,
        pipeline: job.pipeline,
        status: job.status,
        errorCode: job.errorCode,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
        stages: job.stages.map((stage) => ({
          name: stage.name,
          status: stage.status,
          detail: stage.detail,
        })),
      })),
    };
  }

  async openAsset(tenantId: string, documentId: string, assetId: string) {
    const asset = await this.prisma.tenant(tenantId, (tx) =>
      tx.documentAsset.findFirst({
        where: { id: assetId, documentId, tenantId, document: { deletedAt: null } },
      }),
    );
    if (!asset) throw new NotFoundException({ code: "NOT_FOUND", message: "Asset not found" });
    return { asset, stream: await this.storage.get(asset.storageKey) };
  }

  async softDelete(tenantId: string, documentId: string, userId: string, correlationId: string): Promise<void> {
    const result = await this.prisma.tenant(tenantId, async (tx) => {
      const updated = await tx.document.updateMany({
        where: { id: documentId, tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updated.count === 0) return false;
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: userId,
          action: "document.deleted",
          targetType: "document",
          targetId: documentId,
          correlationId,
          metadata: {},
        },
      });
      return true;
    });
    if (!result) throw new NotFoundException({ code: "NOT_FOUND", message: "Document not found" });
  }

  private async scan(bytes: Buffer): Promise<"SKIPPED_NOT_CONFIGURED" | "CLEAN"> {
    if (!this.env.CLAMAV_HOST) return "SKIPPED_NOT_CONFIGURED";
    try {
      const result = await scanBuffer(this.env.CLAMAV_HOST, this.env.CLAMAV_PORT, bytes);
      if (result === "infected") {
        throw new BadRequestException({ code: "MALWARE_DETECTED", message: "The file was rejected by the malware scanner" });
      }
      return "CLEAN";
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new HttpException({ code: "SCAN_UNAVAILABLE", message: "The malware scanner is unavailable" }, 503);
    }
  }

  private present(document: {
    id: string;
    filename: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    status: string;
    pageCount: number | null;
    scanStatus: string;
    metadata: unknown;
    createdAt: Date;
    pages?: { id: string; pageIndex: number; status: string; width: number | null; height: number | null }[];
  }) {
    return {
      id: document.id,
      filename: document.filename,
      mediaType: document.mediaType,
      byteSize: document.byteSize,
      sha256: document.sha256,
      status: document.status,
      pageCount: document.pageCount,
      scanStatus: document.scanStatus,
      metadata: document.metadata,
      createdAt: document.createdAt,
      pages: document.pages ?? [],
    };
  }
}
