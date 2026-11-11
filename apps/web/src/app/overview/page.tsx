"use client";

import { apiRequest } from "@madeye/api-client";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/shell";

interface Stats {
  documents: number;
  processedPages: number;
  jobsSucceeded: number;
  jobsNeedingReview: number;
  processingTrend: { day: string; count: number }[];
  languageDistribution: { status: string; reason: string };
  documentTypeDistribution: { status: string; reason: string };
  usage: { metric: string; quantity: number }[];
}

export default function OverviewPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => apiRequest<Stats>("/api/v1/stats") });
  return (
    <Shell>
      <h1 className="font-serif text-4xl">Overview</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">Counts come from this tenant's database. Language and document-type charts stay empty until those models exist.</p>
      {stats.isLoading ? <p className="mt-8 text-sm">Loading records…</p> : null}
      {stats.data ? (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-4">
            <Metric label="Documents" value={stats.data.documents} />
            <Metric label="Processed pages" value={stats.data.processedPages} />
            <Metric label="Successful jobs" value={stats.data.jobsSucceeded} />
            <Metric label="Needs review" value={stats.data.jobsNeedingReview} />
          </section>
          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border border-line bg-panel p-4">
              <h2 className="font-medium">Jobs, last 14 days</h2>
              {stats.data.processingTrend.length === 0 ? <p className="mt-3 text-sm text-ink/70">No jobs in this window.</p> : (
                <ul className="mt-3 space-y-1 text-sm">
                  {stats.data.processingTrend.map((point) => (
                    <li key={point.day} className="flex justify-between"><span>{point.day}</span><span>{point.count}</span></li>
                  ))}
                </ul>
              )}
            </article>
            <article className="rounded-lg border border-line bg-panel p-4">
              <h2 className="font-medium">Not measured</h2>
              <p className="mt-3 text-sm">{stats.data.languageDistribution.reason}</p>
              <p className="mt-2 text-sm">{stats.data.documentTypeDistribution.reason}</p>
            </article>
          </section>
        </>
      ) : null}
    </Shell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border border-line bg-panel p-4">
      <p className="text-xs tracking-wide text-ink/60 uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
    </article>
  );
}
