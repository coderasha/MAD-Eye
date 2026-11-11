import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "pnpm --filter @madeye/database seed",
  },
  datasource: {
    url: env("DATABASE_URL_MIGRATE"),
  },
});
