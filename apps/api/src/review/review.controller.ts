import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, PermissionGuard, RequirePermission } from "../auth/guards.js";
import { ZodValidationPipe, type RequestWithContext } from "../common/http.js";
import { PrismaService } from "../infra/services.js";
import { NotFoundException } from "@nestjs/common";

const correctionSchema = z.object({
  text: z.string().max(4000),
  reason: z.string().max(500).optional(),
});

@ApiTags("review")
@Controller("v1")
@UseGuards(AuthGuard, PermissionGuard)
export class ReviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("reviews")
  @RequirePermission("reviews:read")
  async list(@Req() request: RequestWithContext) {
    const tenantId = request.auth!.tenantId;
    const rows = await this.prisma.tenant(tenantId, (tx) =>
      tx.reviewTask.findMany({
        where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { document: { select: { filename: true } } },
      }),
    );
    return {
      data: rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        filename: row.document.filename,
        reason: row.reason,
        status: row.status,
        createdAt: row.createdAt,
      })),
    };
  }

  @Post("regions/:id/corrections")
  @RequirePermission("reviews:write")
  async correct(
    @Req() request: RequestWithContext,
    @Param("id") regionId: string,
    @Body(new ZodValidationPipe(correctionSchema)) body: z.infer<typeof correctionSchema>,
  ) {
    const tenantId = request.auth!.tenantId;
    const correction = await this.prisma.tenant(tenantId, async (tx) => {
      const region = await tx.recognitionRegion.findFirst({ where: { id: regionId, tenantId } });
      if (!region) return null;
      const created = await tx.correction.create({
        data: {
          tenantId,
          regionId: region.id,
          authorId: request.auth!.userId,
          previousText: region.text,
          correctedText: body.text,
          reason: body.reason,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorId: request.auth!.userId,
          action: "recognition.corrected",
          targetType: "recognition_region",
          targetId: region.id,
          correlationId: request.correlationId,
        },
      });
      return created;
    });
    if (!correction) throw new NotFoundException({ code: "NOT_FOUND", message: "Region not found" });
    return {
      id: correction.id,
      regionId,
      previousText: correction.previousText,
      correctedText: correction.correctedText,
      originalPreserved: true,
    };
  }
}
