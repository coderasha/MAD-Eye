# MAD-EYE

Proprietary OCR and document-intelligence platform. The running path is account management, adaptive classical preprocessing, classical line and ruled-table geometry, and ME-04 printed recognition when a checksummed ONNX manifest is configured.

The product does not call a third-party OCR engine and it does not invent text. A synthetic bitmap checkpoint is not a measured document accuracy.

## What works

- Organisation accounts, cookie sessions, roles, and hashed API keys.
- Document upload to MinIO after a magic-byte check. Originals are kept.
- Preprocess and recognise jobs through RabbitMQ. Each page is independent.
- OpenCV quality measurement and an adaptive preprocessing plan. Contrast enhancement runs when the ink is faint, not merely because the page is mostly white.
- Classical text-line boxes and ruled-table geometry. Unruled pages produce no table.
- ME-04 CNN + BiLSTM + CTC training, ONNX export, greedy CTC decode, and CER/WER measurement. Reports cannot mark themselves benchmark-validated.
- ONNX loading that refuses a missing file or a bad checksum. Without a manifest, recognition returns no text.
- Review corrections stored beside the original region text.

## What does not work yet

- A model trained on real documents, and any held-out document accuracy.
- Hindi and Odia models, handwriting, layout classification, and document classification.
- Email delivery for password reset.
- Offline installation bundles and Kubernetes.
- The accuracy targets in the product brief. They have not been measured.

## Local checks

```bash
uv sync --all-packages --group dev
uv run pytest
pnpm install
pnpm test
```

`pnpm test` generates the Prisma client. It does not need a running database. Applying migrations does.

## Services

Copy `.env.example` to `.env`, replace the secrets, then:

```bash
docker compose up --build
```

The web app is at `http://localhost:3000`. The platform API is proxied through it. Intelligence health is `http://localhost:8000/v1/health`.

License metadata is `UNLICENSED` until the owner chooses a legal license. See `docs/architecture/TECHNICAL_DECISIONS.md`.
