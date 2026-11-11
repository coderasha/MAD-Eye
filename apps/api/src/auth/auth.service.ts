import { createHash, randomBytes } from "node:crypto";
import { ROLE_KEYS, ROLE_PERMISSIONS, type Permission, type RoleKey } from "@madeye/shared-types";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ENV, type Env } from "../env.js";
import { slugify } from "../common/files.js";
import { PrismaService } from "../infra/services.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import type { LoginInput, RegisterInput } from "./schemas.js";
import { newRefreshRecord, signAccess, signRefresh, signSelection, verifyRefresh, verifySelection } from "./tokens.js";

export interface MembershipView {
  tenantId: string;
  tenantName: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

export interface SessionMaterial {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string };
  tenant: { id: string; name: string; organizationName: string };
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(input: RegisterInput, ip: string | undefined): Promise<SessionMaterial> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.client.user.findUnique({ where: { email } });
    if (existing && !existing.deletedAt) {
      throw new ConflictException({ code: "EMAIL_IN_USE", message: "An account with that email already exists" });
    }
    const passwordHash = await hashPassword(input.password);
    const organizationSlug = await this.uniqueOrganizationSlug(input.organizationName);
    const created = await this.prisma.client.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug: organizationSlug },
      });
      const tenant = await tx.tenant.create({
        data: { organizationId: organization.id, name: input.organizationName, slug: "primary" },
      });
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;
      const ownerRoleId = await this.createSystemRoles(tx, tenant.id);
      const user = await tx.user.create({
        data: { email, passwordHash, displayName: input.displayName },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          tenantId: tenant.id,
          roleId: ownerRoleId,
          status: "ACTIVE",
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          actorId: user.id,
          action: "auth.register",
          targetType: "user",
          targetId: user.id,
          ip,
          metadata: {},
        },
      });
      return { user, tenant, organization };
    });
    return this.issueSession(created.user, {
      tenantId: created.tenant.id,
      tenantName: created.tenant.name,
      organizationId: created.organization.id,
      organizationName: created.organization.name,
      role: "OWNER",
    }, [...ROLE_PERMISSIONS.OWNER]);
  }

  async login(input: LoginInput, ip: string | undefined): Promise<
    | { kind: "session"; session: SessionMaterial }
    | { kind: "select"; selectionToken: string; memberships: MembershipView[] }
  > {
    const email = input.email.toLowerCase();
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    const valid = user && !user.deletedAt ? await verifyPassword(user.passwordHash, input.password) : false;
    if (!user || !valid) {
      await this.prisma.client.auditEvent.create({
        data: { action: "auth.login_failed", targetType: "user", ip, metadata: {} },
      });
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }
    const memberships = await this.listMemberships(user.id);
    if (memberships.length === 0) {
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }
    if (memberships.length > 1) {
      return { kind: "select", selectionToken: await signSelection(this.env, user.id), memberships };
    }
    const only = memberships[0];
    if (!only) throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    const permissions = await this.permissionsFor(user.id, only.tenantId);
    const session = await this.issueSession(user, only, permissions);
    await this.prisma.tenant(only.tenantId, (tx) =>
      tx.auditEvent.create({
        data: {
          tenantId: only.tenantId,
          actorId: user.id,
          action: "auth.login",
          targetType: "user",
          targetId: user.id,
          ip,
          metadata: {},
        },
      }),
    );
    return { kind: "session", session };
  }

  async selectTenant(selectionToken: string, tenantId: string, ip: string | undefined): Promise<SessionMaterial> {
    let userId: string;
    try {
      userId = (await verifySelection(this.env, selectionToken)).sub;
    } catch {
      throw new UnauthorizedException({ code: "SELECTION_EXPIRED", message: "Select an organisation again" });
    }
    const memberships = await this.listMemberships(userId);
    const chosen = memberships.find((membership) => membership.tenantId === tenantId);
    if (!chosen) {
      throw new UnauthorizedException({ code: "TENANT_FORBIDDEN", message: "That organisation is not available" });
    }
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const permissions = await this.permissionsFor(userId, tenantId);
    return this.issueSession(user, chosen, permissions, ip);
  }

  async refresh(refreshToken: string): Promise<SessionMaterial> {
    let claims: { sub: string; jti: string; tokenHash: string };
    try {
      claims = await verifyRefresh(this.env, refreshToken);
    } catch {
      throw new UnauthorizedException({ code: "REFRESH_INVALID", message: "Sign in again" });
    }
    const row = await this.prisma.client.refreshToken.findUnique({ where: { id: claims.jti } });
    if (!row || row.revokedAt || row.expiresAt < new Date() || row.userId !== claims.sub || row.tokenHash !== claims.tokenHash) {
      throw new UnauthorizedException({ code: "REFRESH_INVALID", message: "Sign in again" });
    }
    await this.prisma.client.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    const user = await this.prisma.client.user.findUnique({ where: { id: row.userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException({ code: "REFRESH_INVALID", message: "Sign in again" });
    }
    const memberships = await this.listMemberships(user.id);
    const membership = memberships[0];
    if (!membership || memberships.length !== 1) {
      throw new UnauthorizedException({ code: "TENANT_SELECTION_REQUIRED", message: "Sign in again and choose an organisation" });
    }
    const permissions = await this.permissionsFor(user.id, membership.tenantId);
    return this.issueSession(user, membership, permissions);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const claims = await verifyRefresh(this.env, refreshToken);
      await this.prisma.client.refreshToken.updateMany({
        where: { id: claims.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      return;
    }
  }

  async requestPasswordReset(email: string): Promise<string | null> {
    const user = await this.prisma.client.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.deletedAt) return null;
    const token = randomBytes(32).toString("base64url");
    await this.prisma.client.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return token;
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const row = await this.prisma.client.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: "RESET_INVALID", message: "This reset link is not valid" });
    }
    const passwordHash = await hashPassword(password);
    await this.prisma.client.$transaction([
      this.prisma.client.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.client.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.client.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  async profile(userId: string, tenantId: string): Promise<SessionMaterial["user"] & { tenant: SessionMaterial["tenant"]; permissions: string[] }> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    const memberships = await this.listMemberships(userId);
    const membership = memberships.find((item) => item.tenantId === tenantId);
    if (!membership) throw new UnauthorizedException({ code: "TENANT_FORBIDDEN", message: "Sign in again" });
    const permissions = await this.permissionsFor(userId, tenantId);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      tenant: { id: membership.tenantId, name: membership.tenantName, organizationName: membership.organizationName },
      permissions,
    };
  }

  private async issueSession(
    user: { id: string; email: string; displayName: string },
    membership: MembershipView,
    permissions: string[],
    _ip?: string,
  ): Promise<SessionMaterial> {
    const record = newRefreshRecord();
    await this.prisma.client.refreshToken.create({
      data: { id: record.id, userId: user.id, tokenHash: record.tokenHash, expiresAt: record.expiresAt },
    });
    const accessToken = await signAccess(this.env, user.id, membership.tenantId);
    const refreshToken = await signRefresh(this.env, user.id, record.id, record.tokenHash);
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      tenant: { id: membership.tenantId, name: membership.tenantName, organizationName: membership.organizationName },
      permissions,
    };
  }

  private async listMemberships(userId: string): Promise<MembershipView[]> {
    const rows = await this.prisma.client.membership.findMany({
      where: { userId, status: "ACTIVE", deletedAt: null, tenant: { deletedAt: null }, organization: { deletedAt: null } },
      include: { tenant: true, organization: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      tenantId: row.tenantId,
      tenantName: row.tenant.name,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      role: row.role.key,
    }));
  }

  private async permissionsFor(userId: string, tenantId: string): Promise<string[]> {
    const membership = await this.prisma.client.membership.findFirst({
      where: { userId, tenantId, status: "ACTIVE", deletedAt: null },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!membership) return [];
    return membership.role.permissions.map((item) => item.permission.key);
  }

  private async uniqueOrganizationSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = attempt === 0 ? base : `${base.slice(0, 40)}-${randomBytes(2).toString("hex")}`;
      const found = await this.prisma.client.organization.findUnique({ where: { slug } });
      if (!found) return slug;
    }
    throw new ConflictException({ code: "SLUG_EXHAUSTED", message: "Could not allocate an organisation slug" });
  }

  private async createSystemRoles(tx: Parameters<Parameters<PrismaService["client"]["$transaction"]>[0]>[0], tenantId: string): Promise<string> {
    const permissions = await tx.permission.findMany();
    const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
    let ownerRoleId = "";
    for (const key of ROLE_KEYS) {
      const role = await tx.role.create({ data: { tenantId, key, name: key, system: true } });
      if (key === "OWNER") ownerRoleId = role.id;
      const granted = ROLE_PERMISSIONS[key as RoleKey];
      await tx.rolePermission.createMany({
        data: granted.map((permission: Permission) => {
          const permissionId = byKey.get(permission);
          if (!permissionId) throw new Error(`Missing permission ${permission}`);
          return { roleId: role.id, permissionId };
        }),
      });
    }
    return ownerRoleId;
  }
}
