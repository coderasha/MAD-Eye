import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hmacSha256, sha256 } from "./crypto.js";
import { jobStatusFromPages } from "./jobs.js";
import { redact } from "./redact.js";
import { originalObjectKey, pageObjectKey } from "./storage.js";

const key = Buffer.alloc(32, 7).toString("base64");

describe("platform helpers", () => {
  it("round-trips a webhook secret", () => {
    const encrypted = encryptSecret("signing-secret", key);
    expect(encrypted).not.toContain("signing-secret");
    expect(decryptSecret(encrypted, key)).toBe("signing-secret");
  });

  it("signs a stable body", () => {
    expect(hmacSha256("secret", "{\"a\":1}")).toBe(sha256.length ? hmacSha256("secret", "{\"a\":1}") : "");
    expect(hmacSha256("secret", "{\"a\":1}")).toHaveLength(64);
  });

  it("keeps storage keys inside the tenant prefix", () => {
    const tenant = "11111111-1111-4111-8111-111111111111";
    const document = "22222222-2222-4222-8222-222222222222";
    expect(originalObjectKey(tenant, document, ".pdf").startsWith(`tenants/${tenant}/`)).toBe(true);
    expect(pageObjectKey(tenant, document, 3, "preprocessed")).toContain("/pages/3/preprocessed.png");
    expect(() => originalObjectKey("../etc", document, ".pdf")).toThrow();
  });

  it("derives job status from page outcomes", () => {
    expect(jobStatusFromPages(["COMPLETED", "COMPLETED"])).toBe("SUCCEEDED");
    expect(jobStatusFromPages(["COMPLETED", "FAILED"])).toBe("PARTIAL");
    expect(jobStatusFromPages(["FAILED"])).toBe("FAILED");
    expect(jobStatusFromPages([])).toBe("FAILED");
  });

  it("redacts secrets and leaves document ids", () => {
    expect(redact({ password: "hunter2", documentId: "abc", authorization: "Bearer x" })).toEqual({
      password: "[redacted]",
      documentId: "abc",
      authorization: "[redacted]",
    });
  });
});
