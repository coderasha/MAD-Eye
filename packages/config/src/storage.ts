const SAFE_ID = /^[0-9a-f-]{36}$/i;

function assertId(label: string, value: string): void {
  if (!SAFE_ID.test(value)) {
    throw new Error(`${label} is not a uuid`);
  }
}

export function originalObjectKey(tenantId: string, documentId: string, extension: string): string {
  assertId("tenantId", tenantId);
  assertId("documentId", documentId);
  if (!/^\.[a-z0-9]{1,5}$/.test(extension)) {
    throw new Error("extension is not allowed");
  }
  return `tenants/${tenantId}/documents/${documentId}/original${extension}`;
}

export function pageObjectKey(
  tenantId: string,
  documentId: string,
  pageIndex: number,
  kind: "preprocessed" | "binarized",
): string {
  assertId("tenantId", tenantId);
  assertId("documentId", documentId);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error("pageIndex is invalid");
  }
  return `tenants/${tenantId}/documents/${documentId}/pages/${pageIndex}/${kind}.png`;
}

export function extensionForMediaType(mediaType: string): string {
  switch (mediaType) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/tiff":
      return ".tiff";
    case "image/webp":
      return ".webp";
    default:
      throw new Error("unsupported media type");
  }
}
