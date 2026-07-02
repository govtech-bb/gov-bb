# Deploying `apps/chat` — infra requirements

Handoff for the infra team. The chat app is a TanStack Start (SSR) app built for
**AWS Amplify Hosting Compute** (nitro `aws_amplify` preset, Node 24).

## How config reaches the app — read this first

Amplify Compute does **not** pass console/runtime environment variables to the
SSR Lambda. The app reads config from `process.env.X`, and Vite **bakes those
values into the bundle at build time** via `define` (see `apps/chat/vite.config.ts`).

**Consequence:** every variable in the table below must be set in the Amplify
**build** environment, not just runtime. Changing one requires a **rebuild +
redeploy** — none of these are live-tunable. The only things read at runtime
(via the compute IAM role) are the DB secret *value* and AWS credentials.

## Build-time environment variables

| Variable | Required | Purpose | Example |
|---|---|---|---|
| `RAG_URL` | **yes** | Retrieval/grounding endpoint (usually this app's own origin + `/api`). | `https://chat.alpha.gov.bb/api` |
| `CHAT_DATABASE_CREDENTIALS_SECRET_ARN` | preferred DB path | Secrets Manager ARN of RDS's **master** secret (JSON `{username, password}`). When this **and** `CHAT_DATABASE_HOST`/`PORT`/`NAME` are all set, `db/index.ts` builds the connection string at runtime from them — so the chat self-heals through RDS password rotations without a `tofu apply`. Only the ARN is baked; the value is read at runtime via the compute role. **All four must be set together or the path is skipped.** | `arn:aws:secretsmanager:ca-central-1:…:secret:rds!db-xxxx` |
| `CHAT_DATABASE_HOST` | with creds ARN | RDS endpoint host (non-secret, baked). | `chat-db.xxxx.ca-central-1.rds.amazonaws.com` |
| `CHAT_DATABASE_PORT` | with creds ARN | DB port (non-secret, baked). | `5432` |
| `CHAT_DATABASE_NAME` | with creds ARN | DB name (non-secret, baked). | `chat` |
| `CHAT_DATABASE_URL_SECRET_ARN` | legacy fallback | Secrets Manager ARN of a derived secret holding a full `postgresql://…` connection string. Used only when the preferred path above is not fully configured. Only the ARN is baked; the value is read at runtime via the compute role. | `arn:aws:secretsmanager:ca-central-1:…:secret:chat-db-xxxx` |
| `FORM_API_URL` | if forms on | Forms API base (form definitions + submissions). | `https://forms.alpha.gov.bb` |
| `LANDING_URL` | recommended | Landing-site origin for "go home" links + citation deep-links. **Defaults to prod** (`https://alpha.gov.bb`); set the sandbox origin in non-prod. | `https://landing.sandbox.alpha.gov.bb` |
| `LLM_MODEL` | recommended | Chat model id. **Set explicitly** — the build default is `claude-sonnet-4-6`. | `claude-sonnet-4-6` |
| `REWRITE_MODEL` | optional | Cheaper query-rewrite model (default `claude-haiku-4-5`). | `claude-haiku-4-5` |
| `BEDROCK_REGION` | optional | Region for Bedrock chat + embeddings (default `ca-central-1`). | `ca-central-1` |
| `BEDROCK_EMBED_MODEL` | optional | Titan embed model (default `amazon.titan-embed-text-v2:0`). Must match the model the corpus was ingested with. | `amazon.titan-embed-text-v2:0` |
| `FEATURE_FORMS` | optional | `1`/`true` to enable inline form filling. **Default off.** | `1` |
| `FEATURE_FEEDBACK` | optional | `1`/`true` to enable the in-chat feedback form. **Default off.** | `1` |
| `FEATURE_OFFERS` | optional | `1`/`true` to enable proactive "fill this form?" offers. **Default off.** | `1` |
| `SUBMIT_LIVE` | optional | `1`/`true` to make form submissions **real** (POST to the forms API). **Default off = dry-run** (validates + shapes, never writes). Keep off until forms go live. | `1` |
| `RAG_ONLY` | optional | `1`/`true` master kill-switch — forces every feature off (rollback to Q&A only). | `1` |
| `BEDROCK_PROMPT_CACHE` | optional | `1`/`true` to cache the system prompt via a Bedrock cache point (model/region dependent). | `1` |
| `TURN_TIMEOUT_MS` | optional | Wall-clock ceiling per streamed turn, ms (default `60000`). | `60000` |

Flags use `1`/`true` for on; anything else (incl. unset) is off.

> **Gotcha:** because feature flags are baked, an unset `FEATURE_*` ships **off**
> no matter what's configured at runtime. To turn forms/feedback/offers on in a
> deployed env, set them in the **build** env and redeploy.

> **Cache gotcha:** these values are baked at build time, so `chat:build` must
> rebuild when any of them changes. They're declared as `env` inputs on the
> build target in `apps/chat/project.json` so nx busts its cache on a value
> change — without that, nx replays a previously-cached bundle with the old
> (or empty) baked values even though the Amplify env var was updated. If you
> add a new baked var to `vite.config.ts`, add it to that `inputs` list too.

## Database

- **Postgres with the `pgvector` extension.** Stores the chat corpus (documents,
  chunks, embeddings) loaded by the ingest job.
- The credentials live in **AWS Secrets Manager**. Two paths, in priority
  (see `src/lib/db/index.ts`): **preferred** — RDS's master secret via
  `CHAT_DATABASE_CREDENTIALS_SECRET_ARN` + `CHAT_DATABASE_HOST`/`PORT`/`NAME`
  (self-heals through rotations); **legacy fallback** — a derived full-URL
  secret via `CHAT_DATABASE_URL_SECRET_ARN`. Only ARNs are baked; the SSR
  Lambda reads the secret values at runtime via its compute role.
- The SSR Lambda needs **network reachability** to the DB (VPC / security group).
- Local/CI alternative (not for the Lambda): set `DATABASE_URL` (or
  `CHAT_DATABASE_URL`) directly; `DB_SSL=true` forces SSL.

## IAM — SSR compute role

- `bedrock:InvokeModel` + `bedrock:InvokeModelWithResponseStream` for the chat
  model and the Titan embedding model, in `BEDROCK_REGION`.
- `secretsmanager:GetSecretValue` on the DB secret ARN.
- AWS credentials come from this role at runtime — **do not bake credentials.**
- The Secrets Manager client uses the Lambda's `AWS_REGION` (Amplify sets it).

## Ingest job (corpus loader)

- Built from `apps/chat/Dockerfile.ingest`; runs `pnpm ingest` to embed + load
  the corpus into the DB.
- Needs: DB access (`DATABASE_URL` or the secret ARN + SM read), Bedrock embed
  access (`BEDROCK_REGION` + `InvokeModel` on the Titan model), and network to
  the forms API.
- Embeddings must use the **same** `BEDROCK_EMBED_MODEL` the app queries with.

## Health checks (deploy gating + probes)

- `GET /api/health` — full status (DB connectivity, doc/chunk counts,
  last-ingest status). Returns **503** until healthy. Poll it to gate a deploy on
  ingest completion.
- `GET /api/health/public` — minimal `{ "ok": true|false }`, CORS-open, for a
  load-balancer liveness probe.

## Build

- `nx run chat:build` (Vite → nitro `aws_amplify` preset) → output at
  `apps/chat/.amplify-hosting`. Lambda runtime: `nodejs24.x`.

## Per-environment quick reference

**Sandbox**
```
RAG_URL=https://chat.sandbox.alpha.gov.bb/api
CHAT_DATABASE_URL_SECRET_ARN=arn:aws:secretsmanager:ca-central-1:…:secret:chat-db-sandbox-…
LANDING_URL=https://landing.sandbox.alpha.gov.bb
FORM_API_URL=https://forms-sandbox.alpha.gov.bb
LLM_MODEL=claude-sonnet-4-6
FEATURE_FORMS=1   FEATURE_FEEDBACK=1   FEATURE_OFFERS=1
SUBMIT_LIVE=0     # 1 only when testing real submissions against the sandbox forms API
```

**Production**
```
RAG_URL=https://chat.alpha.gov.bb/api
CHAT_DATABASE_URL_SECRET_ARN=arn:aws:secretsmanager:ca-central-1:…:secret:chat-db-prod-…
LANDING_URL=https://alpha.gov.bb
FORM_API_URL=https://forms.alpha.gov.bb
LLM_MODEL=claude-sonnet-4-6
FEATURE_FORMS, FEATURE_FEEDBACK, FEATURE_OFFERS, SUBMIT_LIVE = set only when each goes live
```
