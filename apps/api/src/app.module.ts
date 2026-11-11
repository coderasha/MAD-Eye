import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { AuthGuard, PermissionGuard } from "./auth/guards.js";
import { CatalogService } from "./catalog.js";
import { CorrelationMiddleware } from "./common/http.js";
import { DocumentsController } from "./documents/documents.controller.js";
import { DocumentsService } from "./documents/documents.service.js";
import { ENV, loadEnv } from "./env.js";
import { HealthController } from "./health.controller.js";
import { JobQueue, ObjectStorage, PrismaService, RateLimit } from "./infra/services.js";
import { MetricsController } from "./metrics.controller.js";
import { PlatformController } from "./platform/platform.controller.js";
import { JobsController } from "./processing/jobs.controller.js";
import { JobsService } from "./processing/jobs.service.js";
import { ReviewController } from "./review/review.controller.js";

@Module({
  controllers: [AuthController, DocumentsController, JobsController, ReviewController, PlatformController, HealthController, MetricsController],
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    PrismaService,
    ObjectStorage,
    JobQueue,
    RateLimit,
    AuthService,
    AuthGuard,
    PermissionGuard,
    DocumentsService,
    JobsService,
    CatalogService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
