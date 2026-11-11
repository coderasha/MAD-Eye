export type PageOutcome = "COMPLETED" | "FAILED";

export function jobStatusFromPages(pages: PageOutcome[]): "SUCCEEDED" | "PARTIAL" | "FAILED" {
  if (pages.length === 0) return "FAILED";
  const completed = pages.filter((status) => status === "COMPLETED").length;
  if (completed === 0) return "FAILED";
  if (completed === pages.length) return "SUCCEEDED";
  return "PARTIAL";
}
