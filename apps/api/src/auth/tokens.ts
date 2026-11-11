import { randomUUID } from "node:crypto";
import { sha256, randomToken } from "@madeye/config";
import { SignJWT, jwtVerify } from "jose";
import type { Env } from "../env.js";

export interface AccessClaims {
  sub: string;
  tid: string;
}

export async function signAccess(env: Env, userId: string, tenantId: string): Promise<string> {
  return new SignJWT({ purpose: "access", tid: tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("madeye")
    .setAudience("madeye-api")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret(env.JWT_ACCESS_SECRET));
}

export async function verifyAccess(env: Env, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secret(env.JWT_ACCESS_SECRET), {
    issuer: "madeye",
    audience: "madeye-api",
  });
  if (payload.purpose !== "access" || typeof payload.tid !== "string" || typeof payload.sub !== "string") {
    throw new Error("ACCESS_TOKEN");
  }
  return { sub: payload.sub, tid: payload.tid };
}

export async function signRefresh(env: Env, userId: string, tokenId: string, tokenHash: string): Promise<string> {
  return new SignJWT({ purpose: "refresh", tokenHash })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(tokenId)
    .setIssuer("madeye")
    .setAudience("madeye-api")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret(env.JWT_REFRESH_SECRET));
}

export async function verifyRefresh(env: Env, token: string): Promise<{ sub: string; jti: string; tokenHash: string }> {
  const { payload } = await jwtVerify(token, secret(env.JWT_REFRESH_SECRET), {
    issuer: "madeye",
    audience: "madeye-api",
  });
  if (payload.purpose !== "refresh" || typeof payload.sub !== "string" || typeof payload.jti !== "string" || typeof payload.tokenHash !== "string") {
    throw new Error("REFRESH_TOKEN");
  }
  return { sub: payload.sub, jti: payload.jti, tokenHash: payload.tokenHash };
}

export async function signSelection(env: Env, userId: string): Promise<string> {
  return new SignJWT({ purpose: "select" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("madeye")
    .setAudience("madeye-api")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret(env.JWT_REFRESH_SECRET));
}

export async function verifySelection(env: Env, token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, secret(env.JWT_REFRESH_SECRET), {
    issuer: "madeye",
    audience: "madeye-api",
  });
  if (payload.purpose !== "select" || typeof payload.sub !== "string") throw new Error("SELECT_TOKEN");
  return { sub: payload.sub };
}

export function newRefreshRecord(): { id: string; secret: string; tokenHash: string; expiresAt: Date } {
  const id = randomUUID();
  const secretValue = randomToken(32);
  return {
    id,
    secret: secretValue,
    tokenHash: sha256(secretValue),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

function secret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
