"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Membership {
  tenantId: string;
  tenantName: string;
  organizationName: string;
  role: string;
}

export default function SelectOrganisationPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="font-serif text-4xl">Choose an organisation</h1>
      <p className="mt-3 text-sm text-ink/70">Sign in first. If your account belongs to more than one tenant, the list appears here.</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const result = await apiRequest<{ status: string; memberships?: Membership[] }>("/api/v1/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
          });
          if (result.status === "tenant_selection_required") setMemberships(result.memberships ?? []);
          else router.push("/overview");
        }}
      >
        <input className="w-full rounded-md border border-line bg-panel px-3 py-2" name="email" type="email" placeholder="Email" required />
        <input className="w-full rounded-md border border-line bg-panel px-3 py-2" name="password" type="password" placeholder="Password" required />
        <Button type="submit">Load organisations</Button>
      </form>
      <ul className="mt-6 space-y-2">
        {(memberships ?? []).map((membership) => (
          <li key={membership.tenantId}>
            <button
              className="w-full rounded-md border border-line bg-panel px-3 py-3 text-left"
              onClick={async () => {
                try {
                  await apiRequest("/api/v1/auth/select-tenant", {
                    method: "POST",
                    body: JSON.stringify({ tenantId: membership.tenantId }),
                  });
                  router.push("/overview");
                } catch {
                  setError("That organisation could not be selected.");
                }
              }}
            >
              <span className="block font-medium">{membership.organizationName}</span>
              <span className="text-sm text-ink/70">{membership.role}</span>
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-copper">{error}</p> : null}
    </main>
  );
}
