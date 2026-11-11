# Implementation roadmap

Status vocabulary used in this repository:

- **Implemented** — code path exists and is covered by a test or an exercised runtime check.
- **Tested** — the automated test for that path has been run in this workspace and the result is recorded.
- **Benchmark-validated** — measured on a held-out labelled set that was not used for training or model selection. Nothing has this status.
- **Production-ready** — security, accuracy, operations, and deployment gates are all met. The platform is not production-ready.
- **Not implemented** — there is no functional path. Callers receive an explicit error or a capability record.

## Phase 1 — Foundation (this milestone)

| Work | Status |
| --- | --- |
| Repository, workspace tooling, Compose | Implemented in this change |
| Architecture and threat boundaries | Implemented as documents |
| PostgreSQL schema and RLS migration | Implemented; migration must be applied against a database |
| Authentication, tenancy, RBAC, API keys | Implemented |
| Upload, magic-byte checks, MinIO, clamav hook | Implemented |
| Preprocess jobs, worker, page-level failure isolation | Implemented |
| Adaptive preprocessing and page rendering | Implemented |
| ME-04 training and CER/WER harness | Implemented. A synthetic bitmap run can be exported. It is not benchmark-validated |
| Product UI for the paths above | Implemented against the API, including recognition review |
| Printed recognition | Implemented when a checksummed manifest is set. Unvalidated output is capped at NEEDS_REVIEW |
| Text-line detection and ruled tables | Implemented as classical geometry. Not benchmark-validated |
| Label extraction | Implemented as a search over recognised lines. Missing labels are omitted |
| Layout classification, handwriting | Not implemented |
| Offline installation bundle | Not implemented |
| Accuracy targets in section 19 of the product brief | Not measured |

## Phase 2 — Proprietary English OCR

1. Publish a dataset manifest with provenance, license, train, validation, and held-out splits.
2. Train ME-04 from `model-factory` on the train split only.
3. Select checkpoints on the validation split.
4. Evaluate once on the held-out split. Record CER, WER, latency, and sample counts in the model registry.
5. Export ONNX, fill `weightsSha256`, and load it through `runtime/onnx_runtime.py`.
6. Persist `recognition_regions` with model id, version, raw confidence, and `calibrated: false` until a calibration map exists.
7. `POST /v1/recognise` already runs this path. A checkpoint stays unvalidated until the held-out measurement is recorded.

Do not import a pretrained public OCR checkpoint and rename it.

## Phase 3 — Hindi and Odia

Separate charsets, grapheme-aware CER (the metric function already exists), and separate held-out sets. Script identification is a prerequisite for routing and is not implemented.

## Phase 4 — Document intelligence

Layout, tables, and schemas. Extraction schemas can already be stored. Populating `extracted_fields` waits on recognition and a tested extractor. Validators for GSTIN shape and dates exist as pure functions and are not a document parser.

## Phase 5 — Handwriting

No handwriting claim until a script-specific held-out set and a trained ME-05 exist.

## Phase 6 — Enterprise operations

TLS termination, backup and restore test, offline bundle, SMTP, Redis-backed multi-node rate limits (single-node Redis limiting is already in the API), load tests, and a reviewed license.

## Acceptance for Phase 1

- `uv run pytest` passes.
- `pnpm test` passes.
- `docker compose up` starts the data services, API, worker, and intelligence service.
- A PDF or image can be uploaded, preprocessed, and viewed without any invented text.
- `POST /v1/recognise` returns 501 when no manifest is configured.
- Evaluation of identical strings reports CER 0 and `benchmarkValidated` false.
