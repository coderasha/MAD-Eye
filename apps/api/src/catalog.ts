import { PERMISSIONS } from "@madeye/shared-types";
import { MODEL_CATALOG } from "@madeye/database";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "./infra/services.js";

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const key of PERMISSIONS) {
      await this.prisma.client.permission.upsert({
        where: { key },
        update: { description: key },
        create: { key, description: key },
      });
    }
    for (const model of MODEL_CATALOG) {
      const row = await this.prisma.client.model.upsert({
        where: { code: model.code },
        update: { name: model.name, family: model.family, task: model.task, description: model.description },
        create: { code: model.code, name: model.name, family: model.family, task: model.task, description: model.description },
      });
      await this.prisma.client.modelVersion.upsert({
        where: { modelId_version: { modelId: row.id, version: model.version } },
        update: { status: model.status, benchmarkValidated: false, license: "proprietary-unreleased" },
        create: {
          modelId: row.id,
          version: model.version,
          status: model.status,
          benchmarkValidated: false,
          license: "proprietary-unreleased",
        },
      });
    }
  }
}
