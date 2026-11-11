"use client";

import { apiRequest } from "@madeye/api-client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Shell } from "@/components/shell";

interface Review { id: string; documentId: string; filename: string; reason: string; status: string }

export default function ReviewsPage() {
  const reviews = useQuery({
    queryKey: ["reviews"],
    queryFn: () => apiRequest<{ data: Review[] }>("/api/v1/reviews"),
  });
  return (
    <Shell>
      <h1 className="font-serif text-4xl">Review</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">Open items are regions the pipeline marked for a person. A correction is stored beside the original text.</p>
      <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-panel">
        {(reviews.data?.data ?? []).map((review) => (
          <li key={review.id} className="px-4 py-3 text-sm">
            <Link className="font-medium underline" href={`/documents/${review.documentId}`}>{review.filename}</Link>
            <p className="text-ink/60">{review.status} · {review.reason}</p>
          </li>
        ))}
        {reviews.data && reviews.data.data.length === 0 ? <li className="px-4 py-6 text-sm text-ink/70">No open review tasks.</li> : null}
      </ul>
    </Shell>
  );
}
