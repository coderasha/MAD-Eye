const PDF = Buffer.from("%PDF");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

export function detectMediaType(bytes: Buffer): string | null {
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(PDF)) return "application/pdf";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG)) return "image/png";
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(JPEG)) return "image/jpeg";
  if (bytes.length >= 4 && (bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))) {
    return "image/tiff";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "document";
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").replace(/^\.+/, "").slice(0, 180);
  return cleaned || "document";
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "organisation";
}
