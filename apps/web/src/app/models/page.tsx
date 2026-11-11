"use client";

import { apiRequest } from "@madeye/api-client";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/shell";

interface ModelRow {
  code: string;
  name: string;
  family: string;
  description: string;
  versions: { version: string; status: string; benchmarkValidated: boolean; metrics: unknown }[];
}

export default function ModelsPage() {
  const models = useQuery({ queryKey: ["models"], queryFn: () => apiRequest<{ data: ModelRow[] }>("/api/v1/models") });
  return (
    <Shell>
      <h1 className="font-serif text-4xl">Models</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">A version is benchmark-validated only when that flag was stored from a held-out report. It is not inferred from the status name.</p>
      <ul className="mt-8 space-y-4">
        {(models.data?.data ?? []).map((model) => (
          <li key={model.code} className="rounded-lg border border-line bg-panel p-4">
            <h2 className="font-medium">{model.name}</h2>
            <p className="mt-1 text-xs tracking-wide text-ink/60 uppercase">{model.family}</p>
            <p className="mt-3 text-sm">{model.description}</p>
            <ul className="mt-3 text-sm">
              {model.versions.map((version) => (
                <li key={version.version}>{version.version} · {version.status} · benchmark {version.benchmarkValidated ? "validated" : "not validated"} · metrics {version.metrics ? "recorded" : "none"}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
