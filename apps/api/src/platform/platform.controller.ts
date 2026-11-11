import { randomBytes } from "node:crypto";
import { encryptSecret, sha256 } from "@madeye/config";
import { builtinTemplates, parseTemplate } from "@madeye/document-schemas";
import { DEFAULT_API_KEY_PERMISSIONS, PERMISSIONS, ROLE_KEYS } from "@madeye/shared-types";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, UseGuards, UsePipes } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard, PermissionGuard, RequirePermission } from "../auth/guards.js";
import { hashPassword } from "../auth/passwords.js";
import { memberSchema } from "../auth/schemas.js";
import { ZodValidationPipe, type RequestWithContext } from "../common/http.js";
import { ENV, type Env } from "../env.js";
import { PrismaService } from "../infra/services.js";

const webhookSchema = z.object({
  url: z.string().url().max(500),
  events: z.array(z.literal("job.completed")).min(1),
});

@ApiTags("platform")
@Controller("v1")
@UseGuards(AuthGuard, PermissionGuard)
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("stats")
  @RequirePermission("documents:read")
  async stats(@Req() request: RequestWithContext) {
    const tenantId = request.auth!.tenantId;
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const snapshot = await this.prisma.tenant(tenantId, async (tx) => {
      const documents = await tx.document.count({ where: { tenantId, deletedAt: null } });
      const pages = await tx.documentPage.count({ where: { tenantId, status: "COMPLETED" } });
      const jobsSucceeded = await tx.processingJob.count({ where: { tenantId, status: "SUCCEEDED" } });
      const reviewOpen = await tx.reviewTask.count({ where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } } });
      const recentJobs = await tx.processingJob.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { createdAt: true, status: true },
      });
      const usage = await tx.usageRecord.groupBy({ by: ["metric"], where: { tenantId }, _sum: { quantity: true } });
      return { documents, pages, jobsSucceeded, reviewOpen, recentJobs, usage };
    });
    const { documents, pages, jobsSucceeded, reviewOpen, recentJobs, usage } = snapshot;
    const trend = new Map<string, number>();
    for (const job of recentJobs) {
      const day = job.createdAt.toISOString().slice(0, 10);
      trend.set(day, (trend.get(day) ?? 0) + 1);
    }
    return {
      documents,
      processedPages: pages,
      jobsSucceeded,
      jobsNeedingReview: reviewOpen,
      processingTrend: [...trend.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
      languageDistribution: { status: "not_available", reason: "Script identification is not implemented." },
      documentTypeDistribution: { status: "not_available", reason: "Document classification is not implemented." },
      usage: usage.map((row) => ({ metric: row.metric, quantity: row._sum.quantity ?? 0 })),
    };
  }

  @Get("models")
  @RequirePermission("models:read")
  async models() {
    const rows = await this.prisma.client.model.findMany({ include: { versions: true }, orderBy: { code: "asc" } });
    return {
      data: rows.map((model) => ({
        code: model.code,
        name: model.name,
        family: model.family,
        task: model.task,
        description: model.description,
        versions: model.versions.map((version) => ({
          version: version.version,
          status: version.status,
          benchmarkValidated: version.benchmarkValidated,
          metrics: version.metrics,
          license: version.license,
          checksumSha256: version.checksumSha256,
        })),
      })),
    };
  }

  @Get("capabilities")
  @RequirePermission("settings:read")
  capabilities() {
    return {
      capabilities: [
        { id: "authentication", status: "implemented", summary: "Password sessions, organisation tenancy, and API keys." },
        { id: "documents", status: "implemented", summary: "Upload, storage, and authenticated download." },
        { id: "preprocess-jobs", status: "implemented", summary: "Queued preprocessing through the intelligence service." },
        { id: "text-recognition", status: "not_implemented", summary: "No production weights are registered." },
        { id: "field-extraction", status: "not_implemented", summary: "Templates can be stored. Values are not extracted." },
        { id: "batch-upload", status: "not_implemented", summary: "Documents are uploaded one at a time." },
        { id: "malware-scanning", status: this.env.CLAMAV_HOST ? "configured" : "not_configured", summary: "ClamAV INSTREAM when CLAMAV_HOST is set. Unscanned files are not marked clean." },
      ],
    };
  }

  @Get("extraction-templates")
  @RequirePermission("documents:read")
  async templates(@Req() request: RequestWithContext) {
    const stored = await this.prisma.tenant(request.auth!.tenantId, (tx) =>
      tx.extractionSchema.findMany({ where: { tenantId: request.auth!.tenantId }, orderBy: { createdAt: "desc" } }),
    );
    return { builtin: builtinTemplates, stored };
  }

  @Post("extraction-schemas")
  @RequirePermission("documents:write")
  async storeTemplate(@Req() request: RequestWithContext, @Body() body: unknown) {
    const template = parseTemplate(body);
    try {
      return await this.prisma.tenant(request.auth!.tenantId, (tx) =>
        tx.extractionSchema.create({
          data: {
            tenantId: request.auth!.tenantId,
            key: template.key,
            name: template.name,
            version: template.version,
            definition: template,
          },
        }),
      );
    } catch {
      throw new ConflictException({ code: "SCHEMA_EXISTS", message: "That schema version already exists" });
    }
  }

  @Get("members")
  @RequirePermission("members:read")
  async members(@Req() request: RequestWithContext) {
    const rows = await this.prisma.client.membership.findMany({
      where: { tenantId: request.auth!.tenantId, deletedAt: null },
      include: { user: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        email: row.user.email,
        displayName: row.user.displayName,
        role: row.role.key,
        status: row.status,
      })),
      assignableRoles: ROLE_KEYS.filter((role) => role !== "OWNER"),
    };
  }

  @Post("members")
  @RequirePermission("members:manage")
  @UsePipes(new ZodValidationPipe(memberSchema))
  async addMember(@Req() request: RequestWithContext, @Body() body: z.infer<typeof memberSchema>) {
    const email = body.email.toLowerCase();
    const tenantId = request.auth!.tenantId;
    const role = await this.prisma.client.role.findUnique({ where: { tenantId_key: { tenantId, key: body.role } } });
    if (!role) throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Role not found" });
    const passwordHash = await hashPassword(body.password);
    const membership = await this.prisma.client.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const user = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, displayName: body.displayName, passwordHash },
      });
      return tx.membership.create({
        data: { userId: user.id, organizationId: tenant.organizationId, tenantId, roleId: role.id, status: "ACTIVE" },
      });
    });
    await this.prisma.tenant(tenantId, (tx) =>
      tx.auditEvent.create({
        data: {
          tenantId,
          actorId: request.auth!.userId,
          action: "member.created",
          targetType: "membership",
          targetId: membership.id,
          metadata: { role: body.role },
        },
      }),
    );
    return { id: membership.id, email, role: body.role };
  }

  @Get("api-keys")
  @RequirePermission("apikeys:manage")
  async listKeys(@Req() request: RequestWithContext) {
    const rows = await this.prisma.client.apiKey.findMany({
      where: { tenantId: request.auth!.tenantId },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        permissions: row.permissions,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        revokedAt: row.revokedAt,
      })),
    };
  }

  @Post("api-keys")
  @RequirePermission("apikeys:manage")
  @UsePipes(new ZodValidationPipe(z.object({ name: z.string().trim().min(1).max(80) })))
  async createKey(@Req() request: RequestWithContext, @Body() body: { name: string }) {
    const prefix = randomBytes(4).toString("hex");
    const secret = randomBytes(24).toString("base64url");
    const token = `me_live_${prefix}_${secret}`;
    const row = await this.prisma.client.apiKey.create({
      data: {
        tenantId: request.auth!.tenantId,
        name: body.name,
        prefix,
        hash: sha256(token),
        permissions: [...DEFAULT_API_KEY_PERMISSIONS],
        createdById: request.auth!.userId,
      },
    });
    return { id: row.id, name: row.name, token, permissions: row.permissions };
  }

  @Delete("api-keys/:id")
  @HttpCode(204)
  @RequirePermission("apikeys:manage")
  async revokeKey(@Req() request: RequestWithContext, @Param("id") id: string) {
    const result = await this.prisma.client.apiKey.updateMany({
      where: { id, tenantId: request.auth!.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException({ code: "NOT_FOUND", message: "API key not found" });
  }

  @Get("webhooks")
  @RequirePermission("webhooks:manage")
  async webhooks(@Req() request: RequestWithContext) {
    const rows = await this.prisma.client.webhook.findMany({ where: { tenantId: request.auth!.tenantId }, orderBy: { createdAt: "desc" } });
    return { data: rows.map((row) => ({ id: row.id, url: row.url, events: row.events, enabled: row.enabled, createdAt: row.createdAt })) };
  }

  @Post("webhooks")
  @RequirePermission("webhooks:manage")
  @UsePipes(new ZodValidationPipe(webhookSchema))
  async createWebhook(@Req() request: RequestWithContext, @Body() body: z.infer<typeof webhookSchema>) {
    const secret = randomBytes(24).toString("base64url");
    const row = await this.prisma.client.webhook.create({
      data: {
        tenantId: request.auth!.tenantId,
        url: body.url,
        events: body.events,
        secretEncrypted: encryptSecret(secret, this.env.WEBHOOK_ENCRYPTION_KEY),
      },
    });
    return { id: row.id, url: row.url, events: row.events, secret };
  }

  @Get("audit")
  @RequirePermission("audit:read")
  async audit(@Req() request: RequestWithContext) {
    const rows = await this.prisma.tenant(request.auth!.tenantId, (tx) =>
      tx.auditEvent.findMany({
        where: { tenantId: request.auth!.tenantId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        createdAt: row.createdAt,
      })),
    };
  }
}

export const permissionKeys = PERMISSIONS;
