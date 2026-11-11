"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorText } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-serif text-4xl">Sign in</h1>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const data = new FormData(event.currentTarget);
          try {
            const result = await apiRequest<{ status: string }>("/api/v1/auth/login", {
              method: "POST",
              body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
            });
            router.push(result.status === "tenant_selection_required" ? "/select-organisation" : "/overview");
          } catch (caught) {
            setError(errorText(caught));
          }
        }}
      >
        <label className="block text-sm">
          Email
          <input className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2" name="email" type="email" required />
        </label>
        <label className="block text-sm">
          Password
          <input className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2" name="password" type="password" required />
        </label>
        {error ? <p className="text-sm text-copper">{error}</p> : null}
        <Button type="submit">Continue</Button>
      </form>
      <p className="mt-6 text-sm">
        <Link href="/register">Create an organisation</Link>
        <span className="px-2">·</span>
        <Link href="/forgot-password">Forgot password</Link>
      </p>
    </main>
  );
}
