# Compose deployment

`docker compose up --build` starts PostgreSQL 16, Redis 7, RabbitMQ, MinIO, the intelligence service, a one-shot migration, the API, the worker, the web app, Prometheus, and Grafana.

The API connects as `madeye_app`. Prisma migrate connects as `madeye`, the table owner. Row level security applies to the app role after the RLS migration.

Default Compose passwords are for a developer machine. Production must replace them, set `NODE_ENV=production`, and set `COOKIE_SECURE=true` behind TLS. The API refuses placeholder secrets when `NODE_ENV=production`.

ClamAV is not in the Compose file. Set `CLAMAV_HOST` when a daemon is available. Until then uploads are stored as `SKIPPED_NOT_CONFIGURED`.

Kubernetes manifests are not part of this release.

The published host ports are 5432, 6379, 5672, 9000, and 9001. If a local service already owns one of those ports, change only the host side of the mapping. Service-to-service URLs inside Compose stay on the container ports.

`minio/minio` was not pullable from Docker Hub in this environment (`pull access denied`). Until that image is available, object storage in Compose will not start. The application client itself was exercised against an S3-compatible stand-in; that stand-in is not part of the product stack.
