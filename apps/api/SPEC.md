# `@govtech-bb/api` — Application Specification

The **`api`** app is the NestJS backend for the gov-bb Modular Forms platform. It exposes a REST API for retrieving published form definitions, persisting in-progress drafts, accepting finalised submissions, and dispatching those submissions to downstream processors (email confirmations, OpenCRVS forwarding, spreadsheet export, EzPay-gated payment collection).

This document captures the **intended feature set** of the application — what the API does for its callers and operators, not how each piece is wired internally.

> Companion to the monorepo-level [`/SPEC.md`](../../SPEC.md), which covers workspace layout, tooling, and shared packages.

---

## 1. Purpose

A single backend service that:

1. **Serves form definitions** — hydrates JSON form schemas stored in Postgres into fully-resolved contracts that frontend renderers (`apps/forms`) can consume.
2. **Manages form drafts** — lets clients save, resume, and abandon in-progress submissions, pinned to a specific form version.
3. **Accepts submissions** — validates payloads against the pinned form contract, persists them with an idempotency guarantee, and routes them through a configurable processor pipeline.
4. **Coordinates payment-gated submissions** — when a form declares a `payment` processor, the API integrates with the EzPay payment gateway, returning a hosted payment URL to the client and resuming downstream processing on a verified callback.
5. **Exports observability and operational signals** — OpenTelemetry traces and metrics, structured logs, health endpoints, and rate-limited entry points so the service can be safely operated in production.

---

## 2. Public HTTP Surface

All responses are wrapped in a uniform envelope (`{ status, message, data, statusCode, meta? }`) produced by `common/response.ts`. OpenAPI/Swagger documentation is served at **`GET /api-docs`** with bearer-auth scaffolding (the bearer enforcement itself is **not yet implemented** — see open questions).

### 2.1 Health

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Liveness probe. Returns `"OK"`. Throttling is bypassed (`@SkipThrottle`). |

### 2.2 Form Definitions  *(tag: `Form Definitions`)*

| Method | Path | Description |
|---|---|---|
| `GET` | `/form-definitions` | List the latest version of every published form (`{ formId, title }[]`). |
| `GET` | `/form-definitions/:formId` | Fetch the hydrated `ServiceContract` for a form. Accepts `?version=` to pin a specific version; otherwise returns the most recently created version. Processors are **stripped from the response** by default so the client never sees server-only config. |

Form definitions are stored as **recipes** (lightweight refs into the component registry) and **hydrated** on read into full schemas. Form versions are immutable — once a `(formId, version)` row exists, its `schema` does not change.

### 2.3 Form Drafts  *(tag: `Form Drafts`)*

| Method | Path | Description |
|---|---|---|
| `POST` | `/form-drafts` | Create a draft. The client supplies the `draftId` (so resuming is idempotent across devices/refreshes); the API pins `formVersion` at creation time. Calling `POST` with an existing `draftId` returns the existing draft unchanged. |
| `GET` | `/form-drafts/:draftId` | Read a draft (values + `lastActivePage` + status). |
| `PATCH` | `/form-drafts/:draftId` | Merge supplied `values` into the stored values (per-step shallow merge); update `lastActivePage`; refresh `lastActiveAt`. Rejects updates to drafts whose status is `abandoned`. |
| `DELETE` | `/form-drafts/:draftId` | Marks the draft `abandoned`. Returns `204 No Content`. |

Drafts have a **7-day inactivity TTL**. A daily cron job (`@Cron(EVERY_DAY_AT_MIDNIGHT)`) deletes drafts that are either marked `abandoned` or whose `lastActiveAt` is older than the TTL.

### 2.4 Submissions  *(tag: `Submissions`)*

| Method | Path | Description |
|---|---|---|
| `POST` | `/submissions` | Validate, persist, and dispatch a form submission. Requires the `Idempotency-Key` request header. Body is size-limited to **1 MiB** by `SubmissionPayloadSizePipe`. |

Submission semantics:

- **Idempotency.** The `Idempotency-Key` header is mandatory and stored uniquely. A retry with the same key returns the original submission (`200`) or `202` if it is still being processed.
- **Optimistic concurrency.** The insert is protected by a `SELECT … FOR UPDATE` transaction so two in-flight retries cannot create duplicate rows.
- **Validation.** The submission pipeline runs in this order:
  1. **Shape expansion** — `expandSubmission` walks the contract and the payload to produce instance lists for repeatable steps, surfacing shape errors (e.g. instance count > step `max`).
  2. **Condition evaluation** — `evaluateFormConditions` (from `@govtech-bb/form-conditions`) computes the set of active vs hidden steps and fields, including per-instance visibility for repeatable steps.
  3. **Field validation** — only active fields on visible steps are validated against the contract's validation rules; repeatable steps additionally enforce the `min` count.
  4. **Normalisation** — `normalizeForStorage` strips values that belong to hidden steps/fields so persisted data matches what the user actually saw.
- **Audit trail.** Each row stores a `meta` object (`SubmissionAuditTrailV2`) recording pinned form version, draft id, visible/hidden step and field ids (per-instance for repeatables), visited pages, and the submission timestamp. V1 trails remain readable for backward compatibility.
- **Status lifecycle.** `submitted` (no payment) or `pending_payment` → `submitted` (after a successful EzPay callback). The schema also defines `draft`, `processing`, `complete`, `error` states; the latter three are not all written today but exist on the enum.
- **Deferred response.** If the form contract contains a `payment` processor, the response includes a `meta.deferred` block with the hosted EzPay URL, payment id, amount, and description so the client can redirect the user.

### 2.5 Payments  *(tag: `Payments`)*

| Method | Path | Description |
|---|---|---|
| `POST` | `/payments/ezpay/webhook` | EzPay server-to-server callback. Verified by HMAC signature (`X-EzPay-Signature` header) when `EZPAY_WEBHOOK_VERIFY_SIGNATURE=true`. Always returns `200 { acknowledged: true }` to avoid EzPay retry storms; failure modes are logged. The route is exempt from rate limiting because throttling EzPay's retries would drop legitimate callbacks. |
| `GET` | `/payments/ezpay/redirect` | EzPay post-payment **return redirect** (browser GET, configured merchant-side as the return URL). EzPay appends `rid` (our payment reference), `tx` (transaction number) and `payment_status`. Confirms the payment via the same verify-and-finalise core as the webhook — so a return alone is enough to finalise and send emails even if the webhook isn't configured — then `302`-redirects the citizen to the form's confirmation page (`${FORMS_BASE_URL}/forms/<formId>/?step=submission-confirmation&payment=success\|failed`). Confirmation is idempotent with the webhook; errors never block the citizen (logged, redirect proceeds). Exempt from rate limiting. |

---

## 3. Domain Modules

### 3.1 Form Definitions Module
- Read-only API. Lists and hydrates published form schemas.
- Hydration delegates to the **Registry** to resolve component/block refs.
- Strips server-side `processors` from outbound payloads unless the caller is the submission pipeline (which needs them for dispatch).

### 3.2 Form Drafts Module
- CRUD for client-managed draft ids.
- Pins the form version at draft creation so the form schema cannot drift under a user mid-flow.
- Owns the 7-day cleanup cron.

### 3.3 Submissions Module
The largest module. Houses:
- **Controller** — `POST /submissions` with payload-size pipe + tiered rate limit.
- **Pipeline service** — expand → evaluate conditions → validate → fold errors → normalize.
- **Service** — idempotency check, transactional insert, payment-gating split, event emission.
- **Processor framework** — pluggable `ISubmissionProcessor` interface with five built-in implementations (see §4).
- **Async listener** — `submission.created` event handler that resolves processor configs (Expressions) and dispatches non-gating processors either in-process or onto SQS.
- **SQS producer / consumer** — durable async processing path with retry and DLQ semantics. Toggled by `SQS_ENABLED`.

### 3.4 Registry Module
- Resolves component/block refs (`components/<id>`, `blocks/<id>`) used inside form **recipes**.
- Two-tier lookup: in-memory **builtins** first (≈35 components, 8 blocks shipped with the API), then a database-backed **custom components** table cached for 60 s.
- Supports per-form **overrides** — recipes can override display fields on a built-in (`label`, etc.) without forking it; `fieldId` and `htmlType` cannot be overridden.

### 3.5 Payments Module
- **EzPay client** — wraps `ezpay_receivecart`, `check_api`, and `transactions_api` endpoints. Per-department API keys are resolved via `DepartmentKeyResolver` (parsed from the `EZPAY_DEPARTMENT_API_KEYS` JSON env var).
- **Webhook service** — verifies the EzPay status, reconciles the amount, writes a `payment_transactions` row, and on success transitions the linked submission from `pending_payment` to `submitted` (in a `FOR UPDATE` transaction) and re-emits `submission.created` to dispatch non-gating processors.
- **Reconciliation service** — every 5 minutes pulls the last 24 h of EzPay transactions, finds any local payments whose status hasn't converged, and replays them through the webhook handler. Guarded by a Postgres advisory lock so multiple API tasks don't double-process.
- **Abandoned-payment cleanup** — daily cron that marks `pending`/`initiated` payments older than 72 h as `cancelled`.

### 3.6 Expressions Module
- Thin wrapper around `@govtech-bb/expressions` (JSON Logic + Luxon).
- Resolves dynamic processor configs at runtime (e.g. an `amount` that depends on the submission values) and re-validates the resolved shape against `resolvedProcessorSchema` — so a misbehaving rule fails with a typed error instead of crashing inside a processor.

### 3.7 Email Module
- **Template service** — loads compiled Handlebars templates from `src/email/templates/` keyed by filename. Ships with `submission-confirmation.hbs`; new forms can drop in a template whose basename matches their `formId`.
- **Body builder** — derives a section-per-step rendering context from the form contract and submission payload, honouring the audit trail's visibility info, formatting `select`/`radio`/`checkbox` values via their option labels, and caching contracts in-process for 10 minutes (form versions are immutable, so this is safe).

### 3.8 Telemetry Module
- Bootstraps the OpenTelemetry Node SDK in `tracing.ts` **before** Nest boots (auto-instrumentations + OTLP HTTP exporters for both traces and metrics). Telemetry is silently disabled if `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_SERVICE_NAME` is unset.
- Exposes a `MetricsService` with named counters: `form.submissions.total`, `form.submissions.duplicates`, `form.validation.failures`, `http.errors.total`.

---

## 4. Submission Processors

Processors are declared per-form (inside the contract's `processors` array) and dispatched after the submission row is persisted. Each implements `ISubmissionProcessor` with a string `type` and an optional `gatesPipeline: true` flag.

| Type | Behaviour | Gating |
|---|---|---|
| `email` | Sends a confirmation email via **AWS SES v2** to a recipient field resolved from the submission values. Body is rendered from a form-specific Handlebars template, falling back to a generic table layout. | No |
| `opencrvs` | `POST`s the submission payload to a configured OpenCRVS endpoint with an `X-Idempotency-Key` header (the submission id) so OpenCRVS dedupes retries. | No |
| `spreadsheet` | Appends the submission to an `.xlsx` workbook (file path configured per form). Idempotent — skips the row if the submission id is already present. | No |
| `webhook` | Generic outbound `POST` of the submission to an HTTP endpoint. The URL comes from either an env var (`config.endpoint.env` + optional `path` — operator deploy config) or a literal `config.url` in the recipe; a recipe-supplied literal must clear an SSRF guard (`https` only, no private/loopback/link-local hosts). Two payload modes: the default **envelope** (`{event, version, timestamp, data}`) or a flattened **mapped** case payload when `config.mapping` is set. Auth is `hmac` (signs the body), `apiKey` (header from env var), or `none` (plus a legacy inline-secret path). Sends `X-Idempotency-Key` (submission id + entry index) so each entry retries independently; skips (logs a warning) when a required env var is unset. | No |
| `payment` | Creates an EzPay payment, persists a `payments` row with status `initiated`, and returns the hosted EzPay URL to the client in the response's `meta.deferred` block. Downstream non-gating processors run **only after** the EzPay webhook confirms `Success`. | **Yes** |

**Dispatch flow:**
1. The synchronous `SubmissionsService` splits processors into gating vs non-gating.
2. If a gating processor exists (currently only `payment`), it runs inline so the response can carry the deferred URL; non-gating processors are not emitted yet.
3. Otherwise, `submission.created` is emitted on the in-process EventEmitter.
4. `SubmissionProcessorListener` resolves processor configs (Expressions), and for each non-gating processor either:
   - **`SQS_ENABLED=true`** — enqueues a `SubmissionSqsMessage` onto the shared queue. The `SqsConsumerService` long-polls (20 s), routes by `processorType`, deletes on success, and lets SQS auto-retry/DLQ on failure. Malformed messages and unknown processor types are deleted to prevent DLQ loops.
   - **Direct path** — invokes the processor in-process, logging failures (no automatic retry).

---

## 5. Persistence

PostgreSQL via TypeORM. Migrations live under `src/database/migrations/` and run automatically on boot before the app accepts traffic. `DB_SYNCHRONIZE` is gated to development only.

| Table | Purpose |
|---|---|
| `form_definitions` | Published form schemas keyed by `(form_id, version)`; `schema` is `jsonb`. |
| `form_components` | Generic versioned component records (`key`, `version`, `schema`). |
| `custom_components` | DB-backed registry entries surfaced by `RegistryService` (cached in-process for 60 s). |
| `form_drafts` | Client-managed `draft_id`, pinned `form_version`, merged values, last active page, status, `last_active_at`. |
| `form_submissions` | Final submissions. Unique on `idempotency_key`; carries `values`, `meta` audit trail, status, `submitted_at`. |
| `payments` | One row per gated submission (unique on `submission_id`). Tracks provider, department, payment code, expected amount, provider token/URL, status. |
| `payment_transactions` | Append-only transactions reported by EzPay (unique on `transaction_number`); preserves the raw provider response. |

Production deployments verify the database TLS certificate; the `DB_SSL_CA` env var can point at a PEM file or contain the PEM directly (for RDS regional CA bundles).

---

## 6. Cross-Cutting Concerns

### 6.1 API hygiene
- **Helmet** with CSP disabled (the API only serves Swagger UI; the web app applies CSP at the Amplify layer).
- **CORS** restricted to `CORS_ORIGIN` (comma-separated list supported). Production env validation forbids `*` or `localhost`.
- **Global ValidationPipe** with `whitelist: true` and `forbidNonWhitelisted: true` — unknown fields are rejected.
- **Global response interceptor** that respects the envelope's `statusCode`, and a **global exception filter** that converts every error into the same envelope, tags the active OTEL span with the error, and increments error counters.
- **Body limit** of 1 MiB at the Express layer plus a 1 MiB pipe on `POST /submissions`. The submission DTO additionally caps instance counts at 500 per step and 2000 total.

### 6.2 Rate limiting
Three tiers configured globally (`short`/`medium`/`long`) and tuned per controller:

| Route | short | medium | long |
|---|---|---|---|
| Default (`@nestjs/throttler` global) | 5 / 10 s | 60 / 60 s | 1000 / 1 h |
| `/form-definitions/*` | 20 / 10 s | 120 / 60 s | (default) |
| `/form-drafts/*` | 5 / 10 s | 30 / 60 s | (default) |
| `POST /submissions` | 3 / 10 s | 10 / 60 s | 50 / 1 h |
| `/health`, `/payments/ezpay/webhook`, `/payments/ezpay/redirect` | bypassed | bypassed | bypassed |

The counters are per-process and in-memory — multi-task deployments rely on AWS WAF as the authoritative rate limiter.

### 6.3 Observability
- OpenTelemetry SDK boots in `tracing.ts` (must be imported first in `main.ts`).
- Filesystem and DNS auto-instrumentations are disabled to reduce noise.
- A `TracingInterceptor` decorates every request span; the exception filter records errors on the active span.
- Metrics flush every 30 s over OTLP HTTP.

### 6.4 Configuration & env validation
- `ConfigModule` is global, loads typed config namespaces (`app`, `database`, `email`, `spreadsheet`, `sqs`, plus `EZPAY_*` direct reads), and validates the environment with **Joi** at boot.
- Joi rules enforce: production CORS safety, mandatory database creds, conditional SQS vars (only required when `SQS_ENABLED=true`), conditional EzPay webhook secret, and required EzPay base URL + department-keys JSON.
- `FORMS_BASE_URL` — public forms site origin the EzPay return redirect bounces the citizen to. When empty it falls back to the first `CORS_ORIGIN` entry (the forms site on every deployed env), so it only needs setting if the two diverge.

### 6.5 Boot sequence (`main.ts`)
1. Import `./tracing` first to initialise OTEL before any Nest code.
2. Create the Nest app with `rawBody: true` (needed for EzPay HMAC verification on the webhook).
3. Apply Helmet, CORS, global filter / interceptors / pipes.
4. **Run pending TypeORM migrations** before binding the port — idempotent because TypeORM tracks applied migrations.
5. Optionally run `runSeed(dataSource)` when `SEED_ON_BOOT=true` (used by `docker-compose`).
6. Build the Swagger document and mount it at `/api-docs`.
7. `app.listen(API_PORT)`.

### 6.6 Scheduled work
| Job | Cadence | Owner |
|---|---|---|
| Expired draft cleanup | Daily at midnight | `FormDraftsService.cleanupExpired` |
| Abandoned payment cleanup | Daily at 02:00 | `AbandonedPaymentCleanupService` |
| EzPay reconciliation | Every 5 minutes | `PaymentReconciliationService` (advisory-locked) |

### 6.7 Deployment
- Multi-stage Dockerfile builds the API in the monorepo context, drops to a non-root `app` user, embeds the AWS RDS global CA bundle for TLS verification, and exposes port `3001`.
- Migrations and Handlebars templates are explicitly copied into the runtime image.
- The image is deployed to **AWS Fargate** via the monorepo's GitHub Actions workflows (`deploy-sandbox.yml`, `deploy-prod.yml`).

---

## 7. Configuration Surface (environment variables)

Required:
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `EZPAY_BASE_URL`, `EZPAY_DEPARTMENT_API_KEYS` (JSON map of department → API key)

Optional / conditionally required:
- `API_PORT` (default `3001`), `CORS_ORIGIN` (default `http://localhost:3000`; production-only safety check forbids `*` and localhost)
- `DB_SYNCHRONIZE`, `DB_LOGGING`, `DB_SSL_CA`
- `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT` (both required for telemetry to be enabled)
- `SES_REGION`, `SES_FROM_ADDRESS` (default `noreply@gov.bb`), `SES_CONFIGURATION_SET`
- `SPREADSHEET_EXPORT_DIR` (defaults to `<cwd>/exports`)
- `SQS_ENABLED`, `SQS_REGION`, `SQS_QUEUE_URL`, `SQS_ENDPOINT` (LocalStack)
- `EZPAY_WEBHOOK_VERIFY_SIGNATURE`, `EZPAY_WEBHOOK_SECRET`
- `SEED_ON_BOOT` (dev convenience — applies the seed form definitions in `database/seed.ts`)

---

## 8. Notable Conventions & Invariants

- **Form versions are immutable** once written. Drafts and submissions store a pinned `formVersion` so schema drift cannot break user flows.
- **Recipes vs schemas** — the database stores lightweight recipes (refs into the Registry); only hydrated schemas are returned over the wire.
- **Idempotency** is enforced at three layers — client-supplied `draftId` for drafts, `Idempotency-Key` header for submissions, `submissionId` reused as the OpenCRVS dedupe key and as the spreadsheet uniqueness column.
- **Visibility is normalised**, not just rendered — hidden steps/fields are stripped from persisted values, and the audit trail records exactly which fields the user saw.
- **Repeatable steps are first-class** throughout the pipeline: per-instance validation, per-instance audit trail, and per-instance email rendering.
- **All endpoints return the same envelope** (`{ status, message, data, statusCode, meta? }`); errors flow through the same shape via `GlobalExceptionFilter`.

---

## 9. Open Questions / Not Yet Resolved

The following items showed up during exploration but I could not confidently classify them as features vs scaffolding. Flagging here for the team to clarify:

1. **Authentication / authorisation.** Swagger is set up with `addBearerAuth` and controllers carry `@ApiBearerAuth`, but I could not find a `JwtAuthGuard` or any guard that actually verifies a bearer token — only the global `ThrottlerGuard` is registered. **Is the API meant to be authenticated, and if so by what mechanism (JWT? IAM SigV4? an upstream API gateway?)** Or is auth deliberately handled at the WAF/ALB layer and the bearer tag is just decorative for now?
2. **Submission statuses `draft`, `processing`, `complete`, `error`.** The `FormSubmissionStatus` enum defines these but the code only writes `submitted`, `pending_payment` (and reads `processing` defensively). Are these reserved for upcoming features (async pipeline state machine?) or stale leftovers?
3. **Pre-v2 audit-trail support (`SubmissionAuditTrailV1`).** The email body builder has a compatibility branch for V1 trails. Is V1 still produced anywhere, or can it be retired?
4. **Form Builder dependency in the Dockerfile.** The runner stage copies `apps/api/src/form-builder/prompts/` ("Form Builder AI system prompt"), but no `form-builder/` directory exists under `apps/api/src/` in the current tree. Has form-builder logic been moved out (to `apps/form_builder`?) and is the Dockerfile line now dead? Confirming whether this should be removed.
5. **Public form definition listing.** `GET /form-definitions` returns every published form with no filtering, no pagination, and no auth. Intended behaviour, or a stub awaiting publish-state filtering / catalogue-style discovery?
6. **Per-form `processors` strip on `GET /form-definitions/:formId`.** Processors are removed from the response unless `includeProcessors=true` is passed by an internal caller. The HTTP controller never sets the flag, so external clients can never request processors. Is that the permanent contract (processors are private), or is there a future read path that exposes them to authenticated callers?
7. **EzPay reconciliation lock key.** Hardcoded to `91337` (`RECONCILIATION_LOCK_KEY`). Probably fine, but worth confirming the value doesn't collide with any other advisory-lock convention in the org.
8. **SES configuration set + multi-region.** `email.region` defaults to `us-east-1`. Is there a deliberate region choice for Barbados-bound traffic, or is this just the SDK default that nobody has revisited?
9. **Spreadsheet processor file location.** It writes to a local directory inside the container (`<cwd>/exports`). On Fargate that is ephemeral. Is the spreadsheet processor production-active (in which case it needs durable storage / S3) or development-only?
10. **`form_components` table.** Defined as an entity with `(key, version)` uniqueness, but I did not find any service that reads or writes it. Is it reserved for a future feature, populated by a sibling app (form builder?), or removable?

---

## 10. Mapping to Source

Quick orientation for reviewers:

| Concern | Path |
|---|---|
| Bootstrap | `src/main.ts`, `src/tracing.ts`, `src/app.module.ts` |
| Forms | `src/forms/form-definitions/`, `src/forms/form-drafts/`, `src/forms/submissions/` |
| Submission processors | `src/forms/submissions/processors/` |
| EzPay client | `src/forms/submissions/processors/payment/ezpay/` |
| Payments domain (webhook, reconciliation, cleanup) | `src/payments/` |
| Component registry | `src/registry/` (built-ins in `src/registry/builtins/`) |
| Email rendering | `src/email/` (templates under `src/email/templates/`) |
| Expressions | `src/expressions/` |
| Persistence / migrations | `src/database/` |
| Telemetry | `src/telemetry/`, `src/tracing.ts` |
| Env / config | `src/config/` |
| Common envelope, errors, filter, interceptors | `src/common/` |
