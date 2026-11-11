"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shell } from "@/components/shell";

interface KeyRow { id: string; name: string; prefix: string; revokedAt: string | null }

export default function ApiKeysPage() {
  const client = useQueryClient();
  const [created, setCreated] = useState<string | null>(null);
  const keys = useQuery({ queryKey: ["keys"], queryFn: () => apiRequest<{ data: KeyRow[] }>("/api/v1/api-keys") });
  return (
    <Shell>
      <h1 className="font-serif text-4xl">API keys</h1>
      <p className="mt-2 text-sm text-ink/70">The secret is shown once. Only its hash is stored.</p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const result = await apiRequest<{ token: string }>("/api/v1/api-keys", { method: "POST", body: JSON.stringify({ name: data.get("name") }) });
          setCreated(result.token);
          await client.invalidateQueries({ queryKey: ["keys"] });
          event.currentTarget.reset();
        }}
      >
        <input name="name" required placeholder="Key name" className="rounded-md border border-line bg-panel px-3 py-2 text-sm" />
        <Button type="submit">Create key</Button>
      </form>
      {created ? <p className="mt-4 break-all rounded-md border border-line bg-paper p-3 text-sm">{created}</p> : null}
      <ul className="mt-6 space-y-2 text-sm">
        {(keys.data?.data ?? []).map((key) => (
          <li key={key.id} className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2">
            <span>{key.name} · {key.prefix} {key.revokedAt ? "· revoked" : ""}</span>
            {key.revokedAt ? null : (
              <button
                className="underline"
                onClick={async () => {
                  await apiRequest(`/api/v1/api-keys/${key.id}`, { method: "DELETE" });
                  await client.invalidateQueries({ queryKey: ["keys"] });
                }}
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </Shell>
  );
}
