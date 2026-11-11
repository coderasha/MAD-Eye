import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { ENV, type Env } from "./env.js";
import { JobQueue, ObjectStorage, PrismaService, RateLimit } from "./infra/services.js";

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: JobQueue,
    private readonly storage: ObjectStorage,
    private readonly limits: RateLimit,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("v1/health")
  async health(@Res({ passthrough: true }) response: Response) {
    const database = await this.prisma.client.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const [redis, rabbit, objectStorage, intelligence] = await Promise.all([
      this.limits.ping(),
      this.queue.ping(),
      this.storage.ensureBucket().then(() => true).catch(() => false),
      fetch(`${this.env.INTELLIGENCE_BASE_URL}/v1/health`, { signal: AbortSignal.timeout(2000) }).then((result) => result.ok).catch(() => false),
    ]);
    const status = database ? "ok" : "unavailable";
    response.status(database ? 200 : 503);
    return { status, components: { database, redis, rabbit, objectStorage, intelligence } };
  }
}
