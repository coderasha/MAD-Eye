"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { errorText } from "@/lib/session";

interface Asset { id: string; kind: string; mediaType: string; pageId: string | null }
interface PageRow { id: string; pageIndex: number; status: string; width: number | null; height: number | null }
interface Stage { name: string; status: string; detail: { model?: { version?: string; benchmarkValidated?: boolean; dataset?: string | null; syntheticCer?: number | null; syntheticWer?: number | null }; pages?: { pageIndex: number; quality?: { blurLevel: string; skewDegrees: number; degradationFlags: string[] }; plan?: { operations: string[]; skipped: string[] } }[] } | null }
interface Box { x: number; y: number; width: number; height: number }
interface Region {
  id: string;
  pageId: string;
  regionIndex: number;
  text: string;
  confidence: number | null;
  calibrated: boolean;
  outputState: string;
  bbox: Box;
  corrections: { id: string; previousText: string; correctedText: string; reason: string | null }[];
}
interface DocumentDetail {
  id: string;
  filename: string;
  status: string;
  scanStatus: string;
  assets: Asset[];
  pages: PageRow[];
  regions: Region[];
  fields: { id: string; fieldKey: string; valueText: string | null; outputState: string }[];
  tables: { id: string; pageId: string; rowCount: number; colCount: number; cells: { rowIndex: number; colIndex: number; text: string | null }[] }[];
  jobs: { id: string; status: string; pipeline: string; stages: Stage[] }[];
}

export default function DocumentViewerPage() {
  const params = useParams<{ id: string }>();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const document = useQuery({
    queryKey: ["document", params.id],
    queryFn: () => apiRequest<DocumentDetail>(`/api/v1/documents/${params.id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const job = query.state.data?.jobs[0]?.status;
      const active = status === "QUEUED" || status === "PROCESSING" || job === "QUEUED" || job === "PENDING" || job === "RUNNING";
      return active ? 1000 : false;
    },
  });
  const detail = document.data;
  const page = detail?.pages.find((item) => item.pageIndex === pageIndex) ?? detail?.pages[0];
  const assetForPage = detail?.assets.find((asset) => asset.kind === "PREPROCESSED_PAGE" && asset.pageId === page?.id);
  const regions = detail?.regions.filter((region) => region.pageId === page?.id) ?? [];
  const recogniseStage = detail?.jobs.find((job) => job.pipeline === "recognise")?.stages.find((stage) => stage.name === "RECOGNISE");
  const quality = detail?.jobs[0]?.stages.find((stage) => stage.name === "QUALITY" || stage.name === "PREPROCESS")?.detail?.pages?.find((item) => item.pageIndex === (page?.pageIndex ?? 0));
  const model = recogniseStage?.detail?.model;
  async function start(pipeline: "preprocess" | "recognise") {
    if (!detail) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/documents/${detail.id}/jobs`, { method: "POST", body: JSON.stringify({ pipeline }) });
      window.setTimeout(() => void client.invalidateQueries({ queryKey: ["document", detail.id] }), 800);
    } catch (caught) {
      setError(errorText(caught));
    }
  }
  return (
    <Shell>
      {detail ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-4xl">{detail.filename}</h1>
              <p className="mt-2 text-sm text-ink/70">{detail.status} · scan {detail.scanStatus}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void start("preprocess")}>Run preprocessing</Button>
              <Button type="button" onClick={() => void start("recognise")}>Run recognition</Button>
            </div>
          </div>
          {model ? (
            <p className="mt-4 text-sm text-ink/70">
              Model {model.version} · dataset {model.dataset ?? "unspecified"} · benchmark validated {model.benchmarkValidated ? "yes" : "no"}
              {model.syntheticCer != null ? ` · synthetic CER ${model.syntheticCer}` : ""}
              {model.syntheticWer != null ? ` · synthetic WER ${model.syntheticWer}` : ""}
            </p>
          ) : null}
          {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-panel p-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span>Page {(page?.pageIndex ?? 0) + 1} of {Math.max(detail.pages.length, 1)}</span>
                <span className="space-x-2">
                  <button type="button" onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>Previous</button>
                  <button type="button" onClick={() => setPageIndex((value) => value + 1)}>Next</button>
                </span>
              </div>
              {assetForPage && page?.width && page.height ? (
                <div className="relative inline-block max-w-full">
                  <img alt="" className="max-h-[70vh] w-full" src={`/api/v1/documents/${detail.id}/assets/${assetForPage.id}/content`} />
                  {regions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      className={`absolute border ${selected === region.id ? "border-copper bg-copper/20" : "border-moss/70"}`}
                      style={{
                        left: `${(region.bbox.x / page.width!) * 100}%`,
                        top: `${(region.bbox.y / page.height!) * 100}%`,
                        width: `${(region.bbox.width / page.width!) * 100}%`,
                        height: `${(region.bbox.height / page.height!) * 100}%`,
                      }}
                      onClick={() => setSelected(region.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink/70">No preprocessed page yet. The original file is unchanged.</p>
              )}
            </section>
            <section className="rounded-lg border border-line bg-panel p-4">
              <h2 className="font-medium">Recognised text</h2>
              {regions.length === 0 ? (
                <p className="mt-3 text-sm">No recognition regions are stored. A missing model or a job that has not run leaves this panel empty.</p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm">
                  {regions.map((region) => (
                    <li key={region.id} className={selected === region.id ? "rounded border border-copper p-2" : "rounded border border-line p-2"}>
                      <button type="button" className="text-left" onClick={() => setSelected(region.id)}>
                        <span className="font-medium">{region.text || "(empty)"}</span>
                        <span className="mt-1 block text-ink/60">{region.outputState} · confidence {region.confidence ?? "—"} · calibrated {region.calibrated ? "yes" : "no"}</span>
                      </button>
                      {region.corrections.map((item) => (
                        <p key={item.id} className="mt-2 text-ink/70">Correction: {item.correctedText} · original kept: {item.previousText || "(empty)"}</p>
                      ))}
                      {selected === region.id ? (
                        <form
                          className="mt-2 flex gap-2"
                          onSubmit={async (event) => {
                            event.preventDefault();
                            try {
                              await apiRequest(`/api/v1/regions/${region.id}/corrections`, { method: "POST", body: JSON.stringify({ text: correction }) });
                              setCorrection("");
                              await client.invalidateQueries({ queryKey: ["document", detail.id] });
                            } catch (caught) {
                              setError(errorText(caught));
                            }
                          }}
                        >
                          <input value={correction} onChange={(event) => setCorrection(event.target.value)} className="flex-1 rounded border border-line bg-paper px-2 py-1" placeholder="Correction" />
                          <Button type="submit">Save correction</Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {detail.fields.length ? (
                <>
                  <h2 className="mt-6 font-medium">Fields</h2>
                  <ul className="mt-2 space-y-1 text-sm">
                    {detail.fields.map((field) => (
                      <li key={field.id}>{field.fieldKey}: {field.valueText ?? "—"} · {field.outputState}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {detail.tables.filter((table) => table.pageId === page?.id).map((table) => (
                <div key={table.id} className="mt-6">
                  <h2 className="font-medium">Ruled table · {table.rowCount}×{table.colCount}</h2>
                  <p className="mt-1 text-sm text-ink/60">Cells come from measured ruling lines. Merged cells are not inferred.</p>
                </div>
              ))}
              <h2 className="mt-6 font-medium">Preprocessing record</h2>
              {quality ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt>Blur</dt><dd>{quality.quality?.blurLevel ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt>Skew</dt><dd>{quality.quality?.skewDegrees ?? "—"}°</dd></div>
                  <div className="flex justify-between"><dt>Flags</dt><dd>{quality.quality?.degradationFlags.join(", ") || "none"}</dd></div>
                  <div><dt className="text-ink/60">Operations</dt><dd>{quality.plan?.operations.join(", ") || "—"}</dd></div>
                  <div><dt className="text-ink/60">Skipped</dt><dd>{quality.plan?.skipped.join(", ") || "—"}</dd></div>
                </dl>
              ) : <p className="mt-3 text-sm text-ink/70">Run preprocessing to record quality measurements.</p>}
            </section>
          </div>
        </>
      ) : <p className="text-sm">Loading document…</p>}
    </Shell>
  );
}
