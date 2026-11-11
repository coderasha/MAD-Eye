import { describe, expect, it } from "vitest";
import { detectMediaType, sanitizeFilename, slugify } from "./files.js";

describe("file guards", () => {
  it("detects allowed signatures and rejects text", () => {
    expect(detectMediaType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(detectMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectMediaType(Buffer.from("not a document"))).toBeNull();
  });

  it("drops path segments from filenames", () => {
    expect(sanitizeFilename("../../secret.pdf")).toBe("secret.pdf");
    expect(sanitizeFilename("a/b\\c.png")).toBe("c.png");
  });

  it("slugifies organisation names", () => {
    expect(slugify("North Odisha Records")).toBe("north-odisha-records");
  });
});
