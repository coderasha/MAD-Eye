import type { LoggerService } from "@nestjs/common";
import { redact } from "@madeye/config";

export function log(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}): void {
  const payload = redact({ time: new Date().toISOString(), level, message, service: "api", ...fields });
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(payload)}\n`);
}

export class JsonLogger implements LoggerService {
  log(message: unknown): void {
    log("info", String(message));
  }
  error(message: unknown): void {
    log("error", String(message));
  }
  warn(message: unknown): void {
    log("warn", String(message));
  }
  debug(message: unknown): void {
    log("info", String(message));
  }
  verbose(message: unknown): void {
    log("info", String(message));
  }
}
