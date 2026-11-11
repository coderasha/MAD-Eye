"use client";

import { apiRequest } from "@madeye/api-client";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/shell";

export default function CapabilitiesPage() {
  const capabilities = useQuery({
    queryKey: ["capabilities"],
    queryFn: () => apiRequest<{ capabilities: { id: string; status: string; summary: string }[] }>("/api/v1/capabilities"),
  });
  return (
    <Shell>
      <h1 className="font-serif text-4xl">Capabilities</h1>
      <ul className="mt-8 space-y-3">
        {(capabilities.data?.capabilities ?? []).map((item) => (
          <li key={item.id} className="rounded-lg border border-line bg-panel p-4">
            <p className="text-xs tracking-wide text-ink/60 uppercase">{item.status}</p>
            <h2 className="mt-1 font-medium">{item.id}</h2>
            <p className="mt-2 text-sm">{item.summary}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
