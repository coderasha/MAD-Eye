# Intelligence contract 1.0.0

JSON is camelCase. The Zod schema in `@madeye/shared-types` and the Pydantic models in `intelligence/core/contracts.py` describe the same preprocess response. A shared fixture lives at `tests/fixtures/preprocess-response.json`.

## Implemented

- `GET /v1/health`
- `GET /v1/capabilities`
- `GET /metrics`
- `POST /v1/preprocess` multipart field `file`. Query: `dpi` (72–400), `includeBinarized`, `allowExperimentalDeblur`.
- `POST /v1/recognise` multipart field `file`. Query: `dpi` (72–400), `labels` as a comma-separated list.

The preprocess response includes quality, the operation plan, PNG bytes, and provenance. `benchmarkValidated` is false.

Recognition runs only when `MADEYE_ME04_MANIFEST` points at a checksummed ONNX file. A missing file returns HTTP 501 and `MODEL_WEIGHTS_NOT_REGISTERED`. A checksum mismatch returns HTTP 409 and `MODEL_INTEGRITY_FAILED`. The response carries the decoded lines, ruled-table geometry when both line directions are measured, and label matches. An unvalidated checkpoint cannot return `RECOGNISED` or `RECOGNISED_WITH_WARNING`; those states are stored as `NEEDS_REVIEW`. An empty decode is `UNREADABLE`. `benchmarkValidated` stays false. Synthetic CER and WER in the manifest are measurements on bitmap glyphs, not a document benchmark.

The platform accepts the job pipelines `preprocess` and `recognise`. Any other pipeline returns `CAPABILITY_NOT_IMPLEMENTED`.

## Not implemented

- `POST /v1/extract` returns HTTP 501 and `NOT_IMPLEMENTED`. Field values are produced inside recognition, and only when the requested label occurs in a decoded line.
