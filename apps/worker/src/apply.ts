import type { PreprocessResponse } from "@madeye/shared-types";
import { jobStatusFromPages } from "@madeye/config";

export function documentStatusFor(jobStatus: "SUCCEEDED" | "PARTIAL" | "FAILED"): "SUCCEEDED" | "PARTIAL" | "FAILED" {
  return jobStatus;
}

export function summarise(response: PreprocessResponse): {
  jobStatus: "SUCCEEDED" | "PARTIAL" | "FAILED";
  stages: { name: "RENDER" | "PREPROCESS" | "QUALITY"; status: "SUCCEEDED" | "FAILED"; detail: unknown }[];
} {
  const outcomes = response.pages.map((page) => page.status);
  const jobStatus = jobStatusFromPages(outcomes);
  const failed = response.errors.length;
  const stageStatus = jobStatus === "FAILED" ? "FAILED" : "SUCCEEDED";
  const detail = {
    pageCount: response.pageCount,
    failed,
    contractVersion: response.contractVersion,
    pages: response.pages.map((page) => ({
      pageIndex: page.pageIndex,
      status: page.status,
      quality: page.quality ?? null,
      plan: page.plan ?? null,
      provenance: page.provenance,
      sha256: page.output?.primarySha256 ?? null,
      errorCode: page.errorCode ?? null,
    })),
  };
  return {
    jobStatus,
    stages: [
      { name: "RENDER", status: stageStatus, detail },
      { name: "PREPROCESS", status: stageStatus, detail },
      { name: "QUALITY", status: stageStatus, detail },
    ],
  };
}
