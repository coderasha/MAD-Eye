# Security design

This is the control design for the Phase 1 codebase. It is not a penetration test and it is not a certification.

## Assets

- Document bytes in MinIO.
- Document metadata, future recognition text, and corrections in PostgreSQL.
- Credentials, API keys, webhook secrets, and session cookies.
- Model weights, when they exist.

## Authentication

- Passwords: Argon2id, policy of at least 12 characters with letters and digits.
- Sessions: short-lived access JWT and rotating refresh token. The refresh token is stored as a SHA-256 hash. Logout revokes it.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`.
- Login responses do not differ between an unknown email and a wrong password.
- Failed-login audit events do not store the email address.
- API keys: shown once, stored as a SHA-256 hash, looked up by prefix, compared with `timingSafeEqual`. Revocation is a timestamp.
- API-key and user requests both resolve to a tenant. The tenant id in a request body is ignored.

## Authorisation

Roles are `OWNER`, `ADMIN`, `MEMBER`, and `REVIEWER`. Permissions are rows, not a second hardcoded check scattered through handlers. Guards load the membership from the database on each request so a role change is not stuck in a token for the access-token lifetime beyond one request.

`OWNER` includes retention purge. `ADMIN` does not.

## Tenant isolation

- `madeye_app` is subject to row level security on document content tables.
- Transactions set `app.current_tenant_id` with `set_config(..., true)` so it ends with the transaction.
- Queries also include `tenant_id` in the `WHERE` clause.
- Storage keys start with `tenants/{tenantId}/`. The stream endpoint checks the asset row under the caller's tenant before reading the object. It does not accept a raw storage key from the client.
- Identity tables are outside RLS for the login and membership-list flow. Handlers select by the authenticated user id.

## Input

- Magic-byte allowlist and a byte-size limit.
- Zod validation on platform bodies. Pydantic validation on intelligence bodies.
- Filenames are basenames, control characters removed, length capped.
- Metadata is a flat map of scalars with a key count limit.
- Intelligence page count and pixel dimensions are capped.

## Malware

The clamd client implements `INSTREAM`. Behaviour:

- Scanner not configured: store the file, status `SKIPPED_NOT_CONFIGURED`.
- Scanner configured and reports a signature: do not keep the object, HTTP 422.
- Scanner configured and unreachable: HTTP 503, object not kept. Fail closed.

Compose does not run ClamAV. An operator sets `CLAMAV_HOST` when a daemon is available.

## Secrets

- Production startup rejects missing secrets and known placeholder values.
- `.env` is gitignored. `.env.example` contains placeholders only.
- Webhook secrets are encrypted with AES-256-GCM. The data key is an environment variable, not a key-management service. A KMS integration is not implemented.
- Service logs pass through a redactor for `password`, `authorization`, `cookie`, `token`, and `secret`.

## Output

- Errors in production omit stack traces.
- Webhook bodies are `{ event, tenantId, jobId, documentId, status, occurredAt }` plus an HMAC header `X-Madeye-Signature`.
- Recognition text cannot leak through webhooks because recognition is not implemented. The webhook type in TypeScript has no text field, so later changes have to edit the type on purpose.

## Retention and deletion

Soft delete hides documents from ordinary queries. The purge sweep permanently deletes objects and rows after `retention_days`. Purge is audited by document id.

Backups are a deployment responsibility. A backup encryption implementation is not in this milestone. Do not treat a Compose volume as a backup.

## Supply chain

Lockfiles are `pnpm-lock.yaml` and `uv.lock`. CI runs the test suites. Dependency audit automation beyond the lockfile is not yet a required check.

## Generative AI

No OpenAI, Gemini, Claude, or other generative client is a dependency. Text is not sent to an external model. Corrections, when they exist, will be human input stored beside the original hypothesis.

## Open security items

- Legal product license is undecided (`UNLICENSED` placeholder).
- No KMS, no tested backup restore, no TLS terminator in Compose, no offline bundle, no WAF.
- Rate limiting is a Redis fixed window on login and upload. It is not a full per-API-key quota system.
- CSRF protection is `SameSite=Lax` plus same-origin proxying. A CSRF token is not issued.
- Row level security has to be verified with the `madeye_app` role after migrations are applied. The policy SQL is in the RLS migration; a cross-tenant integration test should be added when Compose is up.
