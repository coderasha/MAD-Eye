import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards, UsePipes } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ZodValidationPipe, type RequestWithContext } from "../common/http.js";
import { ENV, type Env } from "../env.js";
import { RateLimit } from "../infra/services.js";
import { HttpException } from "@nestjs/common";
import { AuthGuard } from "./guards.js";
import { AuthService } from "./auth.service.js";
import { forgotSchema, loginSchema, registerSchema, resetSchema, selectTenantSchema } from "./schemas.js";

@ApiTags("auth")
@Controller("v1/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limits: RateLimit,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("register")
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.limit(request, "register");
    const session = await this.auth.register(body as never, request.ip);
    this.writeSession(response, session.accessToken, session.refreshToken);
    return this.publicSession(session);
  }

  @Post("login")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.limit(request, "login");
    const result = await this.auth.login(body as never, request.ip);
    if (result.kind === "select") {
      this.cookie(response, "madeye_select", result.selectionToken, 5 * 60 * 1000, "/api/v1/auth");
      return { status: "tenant_selection_required", memberships: result.memberships };
    }
    this.writeSession(response, result.session.accessToken, result.session.refreshToken);
    return this.publicSession(result.session);
  }

  @Post("select-tenant")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(selectTenantSchema))
  async select(@Body() body: { tenantId: string }, @Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.madeye_select;
    if (!token) throw new HttpException({ code: "SELECTION_EXPIRED", message: "Select an organisation again" }, 401);
    const session = await this.auth.selectTenant(token, body.tenantId, request.ip);
    response.clearCookie("madeye_select", { path: "/api/v1/auth" });
    this.writeSession(response, session.accessToken, session.refreshToken);
    return this.publicSession(session);
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.madeye_refresh;
    if (!token) throw new HttpException({ code: "REFRESH_INVALID", message: "Sign in again" }, 401);
    const session = await this.auth.refresh(token);
    this.writeSession(response, session.accessToken, session.refreshToken);
    return this.publicSession(session);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.madeye_refresh);
    response.clearCookie("madeye_access", { path: "/" });
    response.clearCookie("madeye_refresh", { path: "/api/v1/auth" });
  }

  @Post("forgot-password")
  @HttpCode(202)
  @UsePipes(new ZodValidationPipe(forgotSchema))
  async forgot(@Body() body: { email: string }) {
    await this.auth.requestPasswordReset(body.email);
    return {
      status: "accepted",
      delivery: this.env.SMTP_URL ? "not_implemented" : "not_configured",
    };
  }

  @Post("reset-password")
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(resetSchema))
  async reset(@Body() body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Req() request: RequestWithContext) {
    const auth = request.auth;
    if (!auth) throw new HttpException({ code: "UNAUTHENTICATED", message: "Sign in required" }, 401);
    const profile = await this.auth.profile(auth.userId, auth.tenantId);
    return { user: { id: profile.id, email: profile.email, displayName: profile.displayName }, tenant: profile.tenant, permissions: profile.permissions };
  }

  private async limit(request: Request, action: string): Promise<void> {
    const allowed = await this.limits.hit(`${action}:${request.ip ?? "unknown"}`, 10, 60).catch(() => {
      throw new HttpException({ code: "RATE_LIMIT_UNAVAILABLE", message: "Try again shortly" }, 503);
    });
    if (!allowed) throw new HttpException({ code: "RATE_LIMITED", message: "Too many attempts" }, 429);
  }

  private writeSession(response: Response, access: string, refresh: string): void {
    this.cookie(response, "madeye_access", access, 15 * 60 * 1000, "/");
    this.cookie(response, "madeye_refresh", refresh, 7 * 24 * 60 * 60 * 1000, "/api/v1/auth");
  }

  private cookie(response: Response, name: string, value: string, maxAge: number, path: string): void {
    response.cookie(name, value, { httpOnly: true, sameSite: "lax", secure: this.env.cookieSecure, maxAge, path });
  }

  private publicSession(session: { user: { id: string; email: string; displayName: string }; tenant: { id: string; name: string; organizationName: string }; permissions: string[] }) {
    return { status: "authenticated", user: session.user, tenant: session.tenant, permissions: session.permissions };
  }
}
