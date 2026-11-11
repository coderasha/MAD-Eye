import { z } from "zod";

const qualitySchema = z.object({
  blurVariance: z.number(),
  blurLevel: z.enum(["sharp", "moderate", "blurry"]),
  noiseScore: z.number(),
  noiseLevel: z.enum(["low", "medium", "high"]),
  skewDegrees: z.number(),
  contrastStd: z.number(),
  shadowScore: z.number(),
  width: z.number().int(),
  height: z.number().int(),
  dpi: z.number().nullable(),
  resolutionAssessment: z.enum(["adequate", "low", "unknown"]),
  orientationDegrees: z.union([z.literal(0), z.literal(90)]),
  orientationConfidence: z.number(),
  upsideDownResolved: z.boolean(),
  degradationFlags: z.array(z.string()),
});

const planSchema = z.object({
  operations: z.array(z.string()),
  skipped: z.array(z.string()),
  reasons: z.record(z.string(), z.string()),
});

const derivativeSchema = z.object({
  kind: z.literal("binarized"),
  pngBase64: z.string(),
  sha256: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});

const pageOutputSchema = z.object({
  primaryPngBase64: z.string(),
  primarySha256: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  derivatives: z.array(derivativeSchema),
});

const provenanceSchema = z.object({
  component: z.string(),
  version: z.string(),
  modelCode: z.string().nullable(),
  modelVersion: z.string().nullable(),
  benchmarkValidated: z.boolean(),
});

export const pageResultSchema = z.object({
  pageIndex: z.number().int(),
  status: z.enum(["COMPLETED", "FAILED"]),
  dpi: z.number().nullable().optional(),
  quality: qualitySchema.nullable().optional(),
  plan: planSchema.nullable().optional(),
  output: pageOutputSchema.nullable().optional(),
  provenance: provenanceSchema,
  errorCode: z.string().nullable().optional(),
});

export const preprocessResponseSchema = z.object({
  contractVersion: z.literal("1.0.0"),
  inputSha256: z.string(),
  mediaType: z.string(),
  pageCount: z.number().int(),
  pages: z.array(pageResultSchema),
  errors: z.array(
    z.object({
      pageIndex: z.number().int(),
      code: z.string(),
      message: z.string(),
    }),
  ),
});

export type PreprocessResponse = z.infer<typeof preprocessResponseSchema>;

const outputStateSchema = z.enum([
  "RECOGNISED",
  "RECOGNISED_WITH_WARNING",
  "NEEDS_REVIEW",
  "UNREADABLE",
  "VALIDATION_FAILED",
]);

const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const recognisedLineSchema = z.object({
  regionIndex: z.number().int(),
  pageIndex: z.number().int(),
  text: z.string(),
  confidence: z.number().nullable(),
  calibrated: z.boolean(),
  outputState: outputStateSchema,
  bbox: bboxSchema,
  modelCode: z.string().nullable(),
  modelVersion: z.string().nullable(),
  benchmarkValidated: z.boolean(),
});

export const recogniseResponseSchema = z.object({
  contractVersion: z.literal("1.0.0"),
  inputSha256: z.string(),
  mediaType: z.string(),
  pageCount: z.number().int(),
  model: z.object({
    modelCode: z.string(),
    version: z.string(),
    dataset: z.string().nullable().optional(),
    benchmarkValidated: z.boolean(),
    syntheticCer: z.number().nullable().optional(),
    syntheticWer: z.number().nullable().optional(),
  }),
  pages: z.array(
    pageResultSchema.extend({
      lines: z.array(recognisedLineSchema).default([]),
      tables: z.array(z.object({
        bbox: bboxSchema,
        rowCount: z.number().int(),
        colCount: z.number().int(),
        cells: z.array(z.object({
          rowIndex: z.number().int(),
          colIndex: z.number().int(),
          rowSpan: z.number().int(),
          colSpan: z.number().int(),
          bbox: bboxSchema,
          text: z.string().nullable().optional(),
        })),
        provenance: provenanceSchema,
      })).default([]),
      fields: z.array(z.object({
        fieldKey: z.string(),
        label: z.string(),
        valueText: z.string().nullable(),
        confidence: z.number().nullable(),
        calibrated: z.boolean(),
        outputState: z.string(),
        regionIndex: z.number().int().nullable(),
        pageIndex: z.number().int().nullable(),
        validationRule: z.string().nullable().optional(),
        validationPassed: z.boolean().nullable().optional(),
        validationMessage: z.string().nullable().optional(),
      })).default([]),
    }),
  ),
  errors: z.array(
    z.object({
      pageIndex: z.number().int(),
      code: z.string(),
      message: z.string(),
    }),
  ),
});

export type RecogniseResponse = z.infer<typeof recogniseResponseSchema>;

export const jobMessageSchema = z.object({
  jobId: z.string().uuid(),
  tenantId: z.string().uuid(),
  documentId: z.string().uuid(),
  pipeline: z.enum(["preprocess", "recognise"]),
  correlationId: z.string().uuid(),
});

export type JobMessage = z.infer<typeof jobMessageSchema>;

export const IMPLEMENTED_PIPELINES = ["preprocess", "recognise"] as const;

export const PROCESSING_QUEUE = "madeye.processing";

export const webhookJobEventSchema = z.object({
  event: z.literal("job.completed"),
  tenantId: z.string().uuid(),
  jobId: z.string().uuid(),
  documentId: z.string().uuid(),
  status: z.enum(["SUCCEEDED", "PARTIAL", "FAILED"]),
  occurredAt: z.string(),
});

export type WebhookJobEvent = z.infer<typeof webhookJobEventSchema>;
