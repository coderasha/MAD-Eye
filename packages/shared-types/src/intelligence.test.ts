import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { preprocessResponseSchema } from "./intelligence.js";

describe("preprocess contract", () => {
  it("accepts the shared fixture", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const fixture = JSON.parse(readFileSync(join(root, "tests/fixtures/preprocess-response.json"), "utf8"));
    const parsed = preprocessResponseSchema.parse(fixture);
    expect(parsed.contractVersion).toBe("1.0.0");
    expect(parsed.pages[0]?.provenance.benchmarkValidated).toBe(false);
    expect(parsed.pages[0]?.output?.primaryPngBase64).toBeTruthy();
  });
});
