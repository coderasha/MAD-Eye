export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  if (response.status === 401 && retry && !path.includes("/api/v1/auth/")) {
    const refreshed = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    if (refreshed.ok) return apiRequest<T>(path, init, false);
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (!response.ok) {
    throw new ApiError(payload?.error?.message ?? `Request failed (${response.status})`, response.status, payload?.error?.code);
  }
  return payload as T;
}
