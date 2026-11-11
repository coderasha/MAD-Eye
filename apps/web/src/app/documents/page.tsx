"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { errorText } from "@/lib/session";

interface DocumentRow {
  id: string;
  filename: string;
  status: string;
  mediaType: string;
  byteSize: number;
  scanStatus: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiRequest<{ data: DocumentRow[] }>("/api/v1/documents"),
  });
  return (
    <Shell>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl">Documents</h1>
          <p className="mt-2 text-sm text-ink/70">Originals stay in object storage. Scanning is marked skipped unless ClamAV is configured.</p>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setError(null);
            try {
              await apiRequest("/api/v1/documents", { method: "POST", body: data });
              await client.invalidateQueries({ queryKey: ["documents"] });
              event.currentTarget.reset();
            } catch (caught) {
              setError(errorText(caught));
            }
          }}
        >
          <input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/tiff,image/webp" required className="text-sm" />
          <Button type="submit" className="ml-2">Upload</Button>
        </form>
      </div>
      {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
      <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-panel">
        {(documents.data?.data ?? []).map((document) => (
          <li key={document.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <Link href={`/documents/${document.id}`} className="font-medium underline">{document.filename}</Link>
              <p className="text-ink/60">{document.mediaType} · {document.scanStatus} · {document.status}</p>
            </div>
            <span>{Math.ceil(document.byteSize / 1024)} KB</span>
          </li>
        ))}
        {documents.data && documents.data.data.length === 0 ? <li className="px-4 py-6 text-sm text-ink/70">No documents yet.</li> : null}
      </ul>
    </Shell>
  );
}
