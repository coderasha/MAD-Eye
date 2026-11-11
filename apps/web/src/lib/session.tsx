"use client";

import { apiRequest, ApiError } from "@madeye/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export interface Session {
  user: { id: string; email: string; displayName: string };
  tenant: { id: string; name: string; organizationName: string };
  permissions: string[];
}

export function useSession() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiRequest<Session>("/api/v1/auth/me")
      .then(setSession)
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);
  return { session, loading };
}

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "The request failed";
}
