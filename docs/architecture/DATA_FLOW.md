# Data flow

## Upload

1. The browser sends the file to `POST /api/v1/documents` as `multipart/form-data`.
2. The API reads the object into a bounded buffer (default 50 MiB) and detects the type from magic bytes. The client-supplied content type is not trusted.
3. Allowed types: PDF, PNG, JPEG, TIFF, WEBP.
4. SHA-256 is computed. The storage key is `tenants/{tenantId}/documents/{documentId}/original{ext}`.
5. If `CLAMAV_HOST` is set, the bytes are scanned with the clamd `INSTREAM` protocol. Infected files are not stored. If scanning is not configured, the row is `SKIPPED_NOT_CONFIGURED` and is not described as clean.
6. The original object is written to MinIO. A `documents` row and an `ORIGINAL` asset row are committed after the write. A failed database commit is logged with the storage key so the object can be reconciled. The log line does not include the file body or the filename.
7. An audit event `document.created` stores the document id, byte size, and media type.

Filenames are stored as a sanitised display name. They are not used as storage keys and they are not written to logs, because a filename can itself be sensitive.

## Preprocess job

1. `POST /api/v1/documents/{id}/jobs` with `{ "pipeline": "preprocess" }` inserts a job. An optional `Idempotency-Key` header is unique per tenant.
2. The API publishes to RabbitMQ queue `madeye.processing` and marks the job `QUEUED`. If the publish fails, the job stays `PENDING` and the response is HTTP 503. `POST /api/v1/jobs/{id}/requeue` retries publishing.
3. The worker sets the job to `RUNNING` and the document to `PROCESSING`.
4. The worker downloads the original and posts it to the intelligence service with the correlation id.
5. The intelligence service renders each PDF page with PyMuPDF at the requested DPI (default 200, range 72–400) and does not send the file anywhere else.
6. For each page it measures blur, noise, skew, contrast, shadow, resolution, and 0/90 orientation, then chooses operations. See the preprocessing module.
7. The response carries PNG bytes, a quality report, the operation plan, and component provenance. It does not carry recognised text.
8. The worker stores `tenants/{tenantId}/documents/{documentId}/pages/{index}/preprocessed.png` and any requested derivative, then upserts `document_pages` and `document_assets`.
9. Stage rows `RENDER`, `PREPROCESS`, and `QUALITY` record status and the plan. The plan is operational metadata, not document text.
10. Usage is incremented by the number of pages that completed. Webhooks, if configured, receive ids and status only, signed with HMAC-SHA256.
11. Human correction tables are not written, because no recognition output exists.

## Failure isolation

Page exceptions are caught inside the intelligence service. The page is `FAILED` with a short code. Other pages continue. The worker maps:

- all pages completed → job `SUCCEEDED`, document `SUCCEEDED`
- mixed → job `PARTIAL`, document `PARTIAL`
- none completed → job `FAILED`, document `FAILED`

The original asset is retained in every case.

## Recognition flow (not implemented)

`POST /v1/recognise` returns HTTP 501 with `NOT_IMPLEMENTED`. The platform refuses to enqueue that pipeline. No row is written to `recognition_regions`. There is no fallback to Tesseract, PaddleOCR, EasyOCR, or a hosted model API.

When a future model writes a region, `recognition_regions.text` is the original hypothesis and is not updated. Corrections are appended in `corrections`.

## Training data flow

Customer objects in MinIO are not readable by the model factory. A training run requires a dataset manifest with provenance and a license note. No such production dataset is shipped in this repository. The smoke trainer synthesises glyph images in memory and labels the checkpoint `synthetic_smoke` and `benchmarkValidated: false`.

## Retention

Soft delete sets `deleted_at` and leaves bytes in place. The worker sweep, when `RETENTION_SWEEP_ENABLED=true`, hard-deletes objects and rows whose soft-delete age exceeds the tenant `retention_days`. The audit event records the document id only.
