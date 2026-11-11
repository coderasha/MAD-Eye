import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, PermissionGuard, RequirePermission } from "../auth/guards.js";
import { ZodValidationPipe, type RequestWithContext } from "../common/http.js";
import { JobsService } from "./jobs.service.js";

const createJobSchema = z.object({
  pipeline: z.string().min(1).max(64),
});

@ApiTags("jobs")
@Controller("v1")
@UseGuards(AuthGuard, PermissionGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("documents/:id/jobs")
  @RequirePermission("jobs:write")
  create(
    @Req() request: RequestWithContext,
    @Param("id") documentId: string,
    @Body(new ZodValidationPipe(createJobSchema)) body: { pipeline: string },
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.jobs.create({
      tenantId: request.auth!.tenantId,
      userId: request.auth!.userId,
      documentId,
      pipeline: body.pipeline,
      idempotencyKey: idempotencyKey || undefined,
      correlationId: request.correlationId,
    });
  }

  @Get("jobs/:id")
  @RequirePermission("jobs:read")
  get(@Req() request: RequestWithContext, @Param("id") id: string) {
    return this.jobs.get(request.auth!.tenantId, id);
  }

  @Post("jobs/:id/requeue")
  @HttpCode(200)
  @RequirePermission("jobs:write")
  requeue(@Req() request: RequestWithContext, @Param("id") id: string) {
    return this.jobs.requeue(request.auth!.tenantId, id);
  }
}
