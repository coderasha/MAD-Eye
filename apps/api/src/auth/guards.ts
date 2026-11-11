import { timingSafeEqualText, sha256 } from "@madeye/config";
import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ENV, type Env } from "../env.js";
import type { AuthContext, RequestWithContext } from "../common/http.js";
import { PrismaService } from "../infra/services.js";
import { verifyAccess } from "./tokens.js";

export const PERMISSION = "permission";
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION, permission);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const header = request.header("authorization");
    const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
    if (bearer?.startsWith("me_live_")) {
      request.auth = await this.apiKeyPrincipal(bearer);
      return true;
    }
    const token = request.cookies?.madeye_access ?? bearer;
    if (!token) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Sign in required" });
    try {
      const claims = await verifyAccess(this.env, token);
      const membership = await this.prisma.client.membership.findFirst({
        where: { userId: claims.sub, tenantId: claims.tid, status: "ACTIVE", deletedAt: null },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      if (!membership) throw new Error("membership");
      request.auth = {
        userId: claims.sub,
        tenantId: claims.tid,
        permissions: membership.role.permissions.map((item) => item.permission.key),
      };
      return true;
    } catch {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Sign in required" });
    }
  }

  private async apiKeyPrincipal(token: string): Promise<AuthContext> {
    const match = /^me_live_([0-9a-f]{8})_(.+)$/.exec(token);
    if (!match?.[1]) throw new UnauthorizedException({ code: "API_KEY_INVALID", message: "API key rejected" });
    const prefix = match[1];
    const row = await this.prisma.client.apiKey.findFirst({ where: { prefix, revokedAt: null } });
    if (!row || (row.expiresAt && row.expiresAt < new Date()) || !timingSafeEqualText(row.hash, sha256(token))) {
      throw new UnauthorizedException({ code: "API_KEY_INVALID", message: "API key rejected" });
    }
    await this.prisma.client.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return { userId: row.createdById, tenantId: row.tenantId, permissions: row.permissions, apiKeyId: row.id };
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (!request.auth?.permissions.includes(required)) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "You do not have permission for this action" });
    }
    return true;
  }
}
