import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { BadRequestException } from "@nestjs/common";
import { RequirePermission, AuthGuard, PermissionGuard } from "../auth/guards.js";
import type { RequestWithContext } from "../common/http.js";
import { RateLimit } from "../infra/services.js";
import { HttpException } from "@nestjs/common";
import { DocumentsService } from "./documents.service.js";

const metadataSchema = z
  .record(z.string().max(64), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .refine((value) => Object.keys(value).length <= 30, "too many metadata keys");

@ApiTags("documents")
@Controller("v1/documents")
@UseGuards(AuthGuard, PermissionGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly limits: RateLimit,
  ) {}

  @Get()
  @RequirePermission("documents:read")
  list(
    @Req() request: RequestWithContext,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("q") q?: string,
  ) {
    return this.documents.list(request.auth!.tenantId, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      status,
      q,
    });
  }

  @Post()
  @RequirePermission("documents:write")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 52_428_800 } }))
  async upload(
    @Req() request: RequestWithContext,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body("metadata") metadataRaw?: string,
  ) {
    const allowed = await this.limits.hit(`upload:${request.auth!.tenantId}`, 30, 60).catch(() => {
      throw new HttpException({ code: "RATE_LIMIT_UNAVAILABLE", message: "Try again shortly" }, 503);
    });
    if (!allowed) throw new HttpException({ code: "RATE_LIMITED", message: "Too many uploads" }, 429);
    if (!file) throw new BadRequestException({ code: "FILE_REQUIRED", message: "Attach a file" });
    let metadata: Record<string, string | number | boolean | null> | undefined;
    if (metadataRaw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(metadataRaw);
      } catch {
        throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Metadata must be JSON" });
      }
      const result = metadataSchema.safeParse(parsed);
      if (!result.success) {
        throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Metadata is not valid" });
      }
      metadata = result.data;
    }
    return this.documents.upload({
      bytes: file.buffer,
      filename: file.originalname,
      metadata,
      userId: request.auth!.userId,
      tenantId: request.auth!.tenantId,
      correlationId: request.correlationId,
      ip: request.ip,
    });
  }

  @Get(":id")
  @RequirePermission("documents:read")
  get(@Req() request: RequestWithContext, @Param("id") id: string) {
    return this.documents.get(request.auth!.tenantId, id);
  }

  @Get(":id/assets/:assetId/content")
  @RequirePermission("documents:read")
  async content(
    @Req() request: RequestWithContext,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Res() response: Response,
  ) {
    const opened = await this.documents.openAsset(request.auth!.tenantId, id, assetId);
    response.setHeader("Content-Type", opened.asset.mediaType);
    response.setHeader("Content-Length", String(opened.asset.byteSize));
    response.setHeader("Cache-Control", "private, max-age=60");
    response.setHeader("X-Content-Type-Options", "nosniff");
    opened.stream.on("error", () => response.destroy());
    opened.stream.pipe(response);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("documents:delete")
  async remove(@Req() request: RequestWithContext, @Param("id") id: string) {
    await this.documents.softDelete(request.auth!.tenantId, id, request.auth!.userId, request.correlationId);
  }
}
