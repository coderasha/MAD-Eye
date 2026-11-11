# MAD-EYE system architecture

Status: Phase 1 foundation. This document describes the architecture that is being built, and it separates implemented behaviour from later phases.

## Systems

MAD-EYE is one repository and three systems with hard responsibility boundaries.

### Platform

The platform owns identity, tenancy, documents, jobs, review records, API keys, usage, and audit.

- `apps/web` — Next.js product interface.
- `apps/api` — NestJS HTTP API. It does not run recognition models.
- `apps/worker` — queue consumer. It moves bytes and persists results. It does not contain model code.
- PostgreSQL stores metadata. MinIO stores bytes.

### Intelligence engine

`intelligence/` is a stateless FastAPI service.

- It receives document bytes, renders pages, assesses image quality, and applies an adaptive classical preprocessing plan.
- It returns provenance with every result.
- Recognition, layout, tables, classification, and field extraction are explicit unimplemented capabilities. Their routes return HTTP 501 and produce no text.
- Production inference, when weights exist, will load ONNX Runtime sessions after a checksum check. PyTorch is not required on the inference path.

### Model factory

`model-factory/` owns training and evaluation code.

- ME-04 is a MAD-EYE CNN + BiLSTM + CTC network. The code is ours. No third-party OCR engine is wrapped.
- Evaluation reports measured CER and WER and always leaves `benchmarkValidated` false. A low error on a developer fixture is not a production claim.
- Dataset bytes and weight files stay out of Git.

## Runtime shape

```text
Browser
  -> Next.js (same-origin proxy)
    -> NestJS API
      -> PostgreSQL
      -> MinIO
      -> RabbitMQ
        -> Worker
          -> Intelligence engine (HTTP, versioned contract)
          -> MinIO (derived page images)
          -> PostgreSQL (pages, assets, stage detail)
```

Redis is used for rate limits and health. It is not a document store.

## Tenancy

One PostgreSQL database. Every customer document row carries `tenant_id`.

- The application sets `app.current_tenant_id` for the transaction and also filters by `tenant_id`.
- Row Level Security applies to document content tables for the non-owner role `madeye_app`.
- Identity tables (users, memberships, roles) are not under RLS because login must list a user's memberships before a tenant is chosen. Those queries are constrained to the authenticated user.
- Object keys are prefixed `tenants/{tenantId}/`.

The migrator role owns tables and is used only by Prisma migrate. The API and worker connect as `madeye_app`.

## Contracts

- Platform HTTP: `/api/v1`, JSON, camelCase, OpenAPI via Swagger.
- Intelligence HTTP: `/v1`, JSON, camelCase, Pydantic models aligned with Zod schemas in `@madeye/shared-types`.
- Queue message: `{ jobId, tenantId, documentId, pipeline, correlationId }`.

The worker validates the intelligence response with the shared Zod schema before writing.

## Processing

The only executable pipeline in this milestone is `preprocess`.

1. The API stores the original object and a job, then publishes the job.
2. The worker downloads the original and calls `POST /v1/preprocess`.
3. Each page is independent. A failed page is recorded and does not discard successful pages.
4. Derived PNGs are new objects. The original object is never overwritten.
5. Job status is `SUCCEEDED`, `PARTIAL`, or `FAILED` from page outcomes.

`recognise` and `extract` are rejected with `CAPABILITY_NOT_IMPLEMENTED`. The API does not create a job that looks successful.

## Models

| Id | This milestone |
| --- | --- |
| Vision quality | Classical measurements in the preprocessing service. Not a trained network. Not benchmarked against the 99.5% orientation target. |
| ME-04 printed recognition | Architecture, CTC training step, greedy decoder, CER/WER harness. No production weights. |
| ME-02, ME-03, ME-05, ME-06, ME-07, ME-08 | Not implemented. |

180-degree orientation is not decided. A 90-degree rotation is detected and not applied, because the direction is ambiguous without a recognition model.

## Security boundary

- Browser sessions use `HttpOnly` cookies. Access tokens are not stored in `localStorage`.
- Programmatic access uses hashed API keys.
- Logs and webhooks carry identifiers and statuses, not document bytes or recognised text.
- Webhook signing secrets are encrypted with AES-256-GCM before they are stored.

## Deployment

Docker Compose runs PostgreSQL, Redis, RabbitMQ, MinIO, the API, the worker, the intelligence service, Prometheus, and Grafana.

Kubernetes is not part of this release. The `infrastructure/kubernetes/` directory is reserved and contains no manifests.

Air-gapped installation is a documented target. This milestone does not yet produce an offline bundle. Runtime code does not download models.
