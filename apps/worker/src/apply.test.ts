import { describe, expect, it } from "vitest";
import type { PreprocessResponse } from "@madeye/shared-types";
import { summarise } from "./apply.js";

const provenance = {
  component: "preprocessing",
  version: "0.1.0",
  modelCode: null,
  modelVersion: null,
  benchmarkValidated: false,
};

function page(status: "COMPLETED" | "FAILED"): PreprocessResponse["pages"][number] {
  return {
    pageIndex: 0,
    status,
    provenance,
    output: status === "COMPLETED" ? { primaryPngBase64: "aGk=", primarySha256: "abc", width: 1, height: 1, derivatives: [] } : null,
  };
}

describe("preprocess summary", () => {
  it("does not keep image bytes in the stage detail", () => {
    const response: PreprocessResponse = {
      contractVersion: "1.0.0",
      inputSha256: "abc",
      mediaType: "image/png",
      pageCount: 2,
      pages: [{ ...page("COMPLETED"), pageIndex: 0 }, { ...page("FAILED"), pageIndex: 1 }],
      errors: [{ pageIndex: 1, code: "PAGE_FAILED", message: "Error" }],
    };
    const summary = summarise(response);
    expect(summary.jobStatus).toBe("PARTIAL");
    expect(JSON.stringify(summary.stages)).not.toContain("primaryPngBase64");
    expect(summary.stages[0]?.detail).toMatchObject({ failed: 1 });
  });
});
