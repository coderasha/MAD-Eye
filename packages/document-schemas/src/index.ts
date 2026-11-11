import { z } from "zod";

/**
 * Configurable extraction templates.
 * These definitions do not extract anything. The extractor is not implemented.
 */

export const fieldDefinitionSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  required: z.boolean().default(false),
  valueShape: z.enum(["string", "date", "decimal", "gstin"]),
});

export const extractionTemplateSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  version: z.number().int().positive(),
  fields: z.array(fieldDefinitionSchema).min(1),
});

export type ExtractionTemplate = z.infer<typeof extractionTemplateSchema>;

export const invoiceTemplate: ExtractionTemplate = {
  key: "invoice",
  name: "Invoice",
  version: 1,
  fields: [
    { key: "invoiceNumber", label: "Invoice number", required: true, valueShape: "string" },
    { key: "invoiceDate", label: "Invoice date", required: true, valueShape: "date" },
    { key: "seller", label: "Seller", required: false, valueShape: "string" },
    { key: "buyer", label: "Buyer", required: false, valueShape: "string" },
    { key: "gstin", label: "GSTIN", required: false, valueShape: "gstin" },
    { key: "taxableValue", label: "Taxable value", required: false, valueShape: "decimal" },
    { key: "tax", label: "Tax", required: false, valueShape: "decimal" },
    { key: "total", label: "Total", required: false, valueShape: "decimal" },
  ],
};

export const landRecordTemplate: ExtractionTemplate = {
  key: "land-record",
  name: "Land record",
  version: 1,
  fields: [
    { key: "plotNumber", label: "Plot number", required: false, valueShape: "string" },
    { key: "surveyNumber", label: "Survey number", required: false, valueShape: "string" },
    { key: "village", label: "Village", required: false, valueShape: "string" },
    { key: "tehsil", label: "Tehsil", required: false, valueShape: "string" },
    { key: "district", label: "District", required: false, valueShape: "string" },
    { key: "ownerName", label: "Owner name", required: false, valueShape: "string" },
    { key: "landArea", label: "Land area", required: false, valueShape: "string" },
    { key: "documentReference", label: "Document reference", required: false, valueShape: "string" },
  ],
};

export const certificateTemplate: ExtractionTemplate = {
  key: "certificate",
  name: "Certificate",
  version: 1,
  fields: [
    { key: "certificateNumber", label: "Certificate number", required: false, valueShape: "string" },
    { key: "holderName", label: "Holder name", required: false, valueShape: "string" },
    { key: "issuingAuthority", label: "Issuing authority", required: false, valueShape: "string" },
    { key: "issueDate", label: "Issue date", required: false, valueShape: "date" },
    { key: "registrationReference", label: "Registration reference", required: false, valueShape: "string" },
  ],
};

export const builtinTemplates = [invoiceTemplate, landRecordTemplate, certificateTemplate];

export function parseTemplate(value: unknown): ExtractionTemplate {
  return extractionTemplateSchema.parse(value);
}
