import { z } from "zod";

export const ENV = Symbol("ENV");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1).default("madeye"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  WEBHOOK_ENCRYPTION_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  INTELLIGENCE_BASE_URL: z.string().url().default("http://localhost:8000"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  SMTP_URL: z.string().optional(),
  ENABLE_API_DOCS: z.enum(["true", "false"]).default("true"),
});

export type Env = z.infer<typeof schema> & { cookieSecure: boolean };

const PLACEHOLDERS = new Set(["change-me", "changeme", "secret", "password", "replace-me"]);

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join(".") || "env").join(", ");
    throw new Error(`Invalid environment: ${details}`);
  }
  if (parsed.data.NODE_ENV === "production") {
    for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "S3_SECRET_KEY", "WEBHOOK_ENCRYPTION_KEY"] as const) {
      const value = parsed.data[name].toLowerCase();
      if (PLACEHOLDERS.has(value) || value.includes("change-me")) {
        throw new Error(`${name} is still a placeholder`);
      }
    }
  }
  return { ...parsed.data, cookieSecure: parsed.data.COOKIE_SECURE === "true" };
}
