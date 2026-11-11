import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12)
  .max(200)
  .regex(/[A-Za-z]/, "must include a letter")
  .regex(/[0-9]/, "must include a digit");

export const registerSchema = z.object({
  email: z.string().trim().max(320).email(),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
  organizationName: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().max(320).email(),
  password: z.string().min(1).max(200),
});

export const selectTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const forgotSchema = z.object({
  email: z.string().trim().max(320).email(),
});

export const memberSchema = z.object({
  email: z.string().trim().max(320).email(),
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
  role: z.enum(["ADMIN", "MEMBER", "REVIEWER"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
