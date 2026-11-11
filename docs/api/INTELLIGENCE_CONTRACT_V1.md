# Intelligence contract 1.0.0

JSON is camelCase. The Zod schema in `@madeye/shared-types` and the Pydantic models in `intelligence/core/contracts.py` describe the same preprocess response. A shared fixture lives at `tests/fixtures/preprocess-response.json`.

## Implemented

- `GET /v1/health`
- `GET /v1/capabilities`
- `GET /metrics`
- `POST /v1/preprocess` multipart field `file`. Query: `dpi` (72–400), `includeBinarized`, `allowExperimentalDeblur`.

The preprocess response includes quality, the operation plan, PNG bytes, and provenance. `benchmarkValidated` is false. There is no recognised text.

## Not implemented

- `POST /v1/recognise` returns HTTP 501 and `NOT_IMPLEMENTED`.
- `POST /v1/extract` returns HTTP 501 and `NOT_IMPLEMENTED`.

The platform rejects any job pipeline other than `preprocess` with `CAPABILITY_NOT_IMPLEMENTED`. It does not store a successful recognition job.
