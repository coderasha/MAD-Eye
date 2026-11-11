import { PERMISSIONS } from "@madeye/shared-types";
import { createPrismaClient } from "./index.js";
import { MODEL_CATALOG } from "./catalog.js";

const databaseUrl = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL_MIGRATE or DATABASE_URL is required to seed");
}

const prisma = createPrismaClient(databaseUrl);

for (const key of PERMISSIONS) {
  await prisma.permission.upsert({
    where: { key },
    update: { description: key },
    create: { key, description: key },
  });
}

for (const model of MODEL_CATALOG) {
  const row = await prisma.model.upsert({
    where: { code: model.code },
    update: {
      name: model.name,
      family: model.family,
      task: model.task,
      description: model.description,
    },
    create: {
      code: model.code,
      name: model.name,
      family: model.family,
      task: model.task,
      description: model.description,
    },
  });
  await prisma.modelVersion.upsert({
    where: { modelId_version: { modelId: row.id, version: model.version } },
    update: {
      status: model.status,
      benchmarkValidated: false,
      license: "proprietary-unreleased",
    },
    create: {
      modelId: row.id,
      version: model.version,
      status: model.status,
      benchmarkValidated: false,
      license: "proprietary-unreleased",
    },
  });
}

await prisma.$disconnect();
