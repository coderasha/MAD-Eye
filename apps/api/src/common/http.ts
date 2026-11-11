import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  Injectable,
  type NestMiddleware,
  type PipeTransform,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import { log } from "../logging.js";

export interface RequestWithContext extends Request {
  correlationId: string;
  auth?: AuthContext;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  permissions: string[];
  apiKeyId?: string;
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const incoming = request.header("x-correlation-id");
    const correlationId = incoming && /^[0-9a-zA-Z-]{8,80}$/.test(incoming) ? incoming : randomUUID();
    request.correlationId = correlationId;
    response.setHeader("x-correlation-id", correlationId);
    next();
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithContext>();
    const correlationId = request.correlationId;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const record = typeof body === "string" ? { message: body } : (body as Record<string, unknown>);
      const message = Array.isArray(record.message) ? record.message.join(", ") : String(record.message ?? "Request failed");
      response.status(status).json({
        error: {
          code: String(record.code ?? "HTTP_ERROR"),
          message,
          details: record.details,
          correlationId,
        },
      });
      return;
    }
    log("error", "unhandled_error", {
      correlationId,
      name: exception instanceof Error ? exception.name : "Error",
    });
    response.status(500).json({
      error: { code: "INTERNAL", message: "The request could not be completed", correlationId },
    });
  }
}

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }
}
