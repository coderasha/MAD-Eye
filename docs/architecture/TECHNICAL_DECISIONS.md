# Technical decisions

Decisions below are in force for this repository. Open items are marked and are not silent assumptions about licensing or data loss.

## TD-001 Monorepo split

pnpm workspaces and Turborepo manage TypeScript. uv manages a Python workspace (`intelligence`, `model-factory`) with a lockfile at the repository root. Python services are not packed as pnpm packages.

## TD-002 Language and runtime versions

- Node.js 22 or newer for the platform. The container image is Node 22.
- TypeScript 5.9. Prisma ORM 7 recommends the 5.9 line, and NestJS decorator metadata is compiled with that line. TypeScript 7 is current upstream and is intentionally not adopted yet.
- Python 3.11, as required for the intelligence engine. The developer machine also has Python 3.10 on `python3`; tooling uses 3.11 explicitly.
- Next.js 16, React 19, NestJS 12, Prisma ORM 7.10, Zod 4, Tailwind CSS 4.

## TD-003 Prisma 7 client

The client generator is `prisma-client` with a custom output under `packages/database/generated`. The API constructs `PrismaClient` with `@prisma/adapter-pg`. The connection string is not in `schema.prisma`; it lives in `prisma.config.ts` for the CLI and in `DATABASE_URL` for the application.

`DATABASE_URL` is the `madeye_app` role. `DATABASE_URL_MIGRATE` is the table owner and is the only URL Prisma migrate uses.

## TD-004 NestJS on Express

NestJS 12 recommends the Node HTTP adapter. This API uses the Express adapter because multipart upload, cookie parsing, and streaming downloads are already defined there. The intelligence service is FastAPI and is unaffected.

The API is an ES module. Relative imports use the `.js` specifier.

## TD-005 No OCR engine substitution

If recognition weights are absent, the service fails with `NOT_IMPLEMENTED`. It does not call Tesseract, PaddleOCR, EasyOCR, or a commercial OCR API. Those tools are not dependencies.

## TD-006 PyTorch stays in the model factory

Training uses PyTorch. The intelligence image installs OpenCV, PyMuPDF, Pillow, NumPy, SciPy, and ONNX Runtime. It does not install PyTorch. A future deployed recogniser is an ONNX artefact checked by SHA-256 before `InferenceSession` creation.

CPU wheels are selected for PyTorch so a CUDA toolkit is not required for development. GPU execution is a later runtime setting, not a second codebase.

## TD-007 Adaptive classical preprocessing

Preprocessing is deterministic OpenCV and NumPy. It is not a neural enhancer and not a generative inpainter.

The primary derivative is a grayscale image. Binarisation is a separate derivative and only runs when requested. Classical unsharp masking is implemented and off by default because it invents edge contrast. No operation is allowed to synthesise missing glyphs.

Orientation at 180 degrees is unresolved. Orientation at 90 degrees is reported and not corrected unless a future recogniser confirms the direction.

## TD-008 Sessions

Browser authentication uses `HttpOnly`, `SameSite=Lax` cookies (`madeye_access`, `madeye_refresh`). The Next.js app proxies `/api/v1` so the cookie is first-party on local HTTP. Programmatic clients use API keys. Tokens are not returned to JavaScript.

A user with more than one tenant receives a short-lived `madeye_select` cookie and must call `POST /api/v1/auth/select-tenant`.

Passwords are hashed with Argon2id (`@node-rs/argon2`, prebuilt native binaries).

## TD-009 Encryption and malware scanning

- Transport encryption is terminated by the deployment reverse proxy. Compose on a developer machine is HTTP. Production configuration must set `COOKIE_SECURE=true` and TLS.
- Webhook secrets are encrypted at rest with AES-256-GCM. The key is `WEBHOOK_ENCRYPTION_KEY`.
- Object storage is private. The viewer streams bytes through the API after an authorisation check, so a MinIO hostname does not have to be signed into a browser URL.
- Server-side disk encryption for MinIO volumes is a deployment control, not an application toggle. SSE is not claimed until it is configured and tested.
- ClamAV is supported through clamd `INSTREAM`. Unconfigured scanning is visible as `SKIPPED_NOT_CONFIGURED`.

## TD-010 Queues

RabbitMQ carries job messages. The worker is a separate process so API latency does not include rendering. Redis is the rate-limit counter. Kafka is not introduced.

## TD-011 Page memory

PDF pages are rendered one at a time. Images whose longest side exceeds 4,000 pixels are downscaled with area interpolation before the rest of the plan. The service rejects files over the configured byte limit instead of spooling an unbounded buffer. A later improvement is disk spooling for larger batches.

## TD-012 Metrics honesty

Prometheus metrics count requests, preprocess duration, pages, and failures. Dashboards do not contain an accuracy panel. Accuracy appears only in an evaluation report produced from labelled pairs, with `benchmarkValidated` left false by the harness.

## TD-013 Customer data is not training data

Nothing in the upload or job path writes to `datasets/`. Using customer documents for training requires a separate governance decision, a dataset manifest, and a license record. That path is not implemented.

## TD-014 License (open)

Package metadata is `UNLICENSED`. Model manifests use `proprietary-unreleased`. This is a holding position so the repository is not accidentally marked open source. It is not a substitute for a legal license chosen by the owner.

## TD-015 Email delivery

Password reset stores a hashed token. If `SMTP_URL` is unset, no message is sent and the token is not written to logs. Administrators reset passwords directly for air-gapped installations. The API still returns a generic accepted response so it does not reveal whether the email exists.

## TD-016 Kubernetes

Not in the initial implementation. Compose is the on-premise unit. Horizontal scaling of stateless API replicas and workers is possible later because jobs are queued and files are in object storage.
