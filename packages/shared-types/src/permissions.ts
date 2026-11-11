export const PERMISSIONS = [
  "documents:read",
  "documents:write",
  "documents:delete",
  "jobs:read",
  "jobs:write",
  "reviews:read",
  "reviews:write",
  "members:read",
  "members:manage",
  "apikeys:manage",
  "webhooks:manage",
  "models:read",
  "audit:read",
  "settings:read",
  "retention:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = ["OWNER", "ADMIN", "MEMBER", "REVIEWER"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const ALL: readonly Permission[] = PERMISSIONS;
const WITHOUT_RETENTION = PERMISSIONS.filter((key) => key !== "retention:manage");

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: WITHOUT_RETENTION,
  MEMBER: ["documents:read", "documents:write", "jobs:read", "jobs:write", "models:read", "settings:read"],
  REVIEWER: ["documents:read", "jobs:read", "reviews:read", "reviews:write", "models:read"],
};

export const DEFAULT_API_KEY_PERMISSIONS: readonly Permission[] = [
  "documents:read",
  "documents:write",
  "jobs:read",
  "jobs:write",
];
