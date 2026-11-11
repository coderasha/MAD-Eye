# MAD-EYE

Proprietary OCR and document-intelligence platform. Phase 1 is the platform foundation, adaptive classical preprocessing, and the ME-04 training and evaluation framework.

Recognition weights are not registered. The product does not call a third-party OCR engine and it does not invent text.

## What works

- Organisation accounts, cookie sessions, roles, and hashed API keys.
- Document upload to MinIO after a magic-byte check. Originals are kept.
- Preprocess jobs through RabbitMQ. Each page is independent.
- OpenCV quality measurement and an adaptive preprocessing plan.
- ME-04 CNN + BiLSTM + CTC training code, greedy CTC decode, and CER/WER measurement. Reports cannot mark themselves benchmark-validated.
- ONNX loading that refuses a missing file or a bad checksum.

## What does not work yet

- Text detection, printed recognition inference, handwriting, layout, tables, classification, and field extraction.
- Hindi and Odia models.
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
