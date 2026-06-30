# Chat DB self-heal through RDS password rotation — design

- **Issue:** gov-bb #1478 (chat: cached secret doesn't pick up RDS rotations without a redeploy)
- **Date:** 2026-06-25
- **Status:** approved (brainstorming) → pending implementation plan

## Problem

`apps/chat/src/lib/secrets.ts` caches Secrets Manager values in an in-memory
`Map` keyed by ARN, with **no invalidation hook**, and `apps/chat/src/lib/db/index.ts`
caches the `pg.Pool` (built from the resolved connection string) for the warm
Lambda container's lifetime. When the RDS-managed master password rotates, a warm
chat SSR container keeps using the **old** password in both caches and cannot
reconnect — `/api/health` returns `{"ok":false,"db":"disconnected"}` (503) until
the container recycles or chat is redeployed.

This was confirmed live on 2026-06-25: with chat on the new master-secret path,
a manual rotation of the staging RDS master (no `tofu apply`) left chat
disconnected for ~5 minutes with no in-place recovery. The deployed `#915`
(`fafbfc24`) only added the master-secret *read* path — `health.ts` calls
`getDb()` directly and there is no auth-failure retry.

## Goal

Chat recovers from an RDS master-password rotation **in place** — on the next
request, with **no redeploy and no `tofu apply`** — when running on the
master-secret path (`CHAT_DATABASE_CREDENTIALS_SECRET_ARN`).

## Non-goals (explicitly out of scope)

- **form_builder migration** to the shared package — it has its own duplicate
  secrets helper; track under EPIC #1423.
- **TTL-based** cache expiry (issue #1478's original sketch) — rejected: a TTL on
  the secret cache alone does not rebuild the cached `pg.Pool`, and adds
  steady-state Secrets Manager calls. Invalidate-on-auth-failure is immediate and
  has zero steady-state cost.
- **RDS IAM auth** (#915's heavier alternative).
- The **prod infra promotion** (Amplify env vars + compute-role IAM grant). It is
  a separate, already-understood PR mirroring staging (#386 env vars + #387 IAM
  grant), currently held by the user. It is a *downstream dependency* of this work
  for prod to benefit, not part of this spec.

## Decisions (from brainstorming)

1. **Mechanism:** invalidate-on-`28P01` (not TTL, not both).
2. **Scope:** extract a shared `@govtech-bb/aws-secrets` package; migrate **chat
   only**.
3. **Verification bar:** a live rotation test is required, layered on top of unit
   and local-integration tests (three-tier ladder below).

## Architecture & components

### New package `@govtech-bb/aws-secrets` (buildable nx project)

Salvaged from the existing (uncommitted) local work, which is already written and
unit-tested:

- `getCachedSecretString(arn): Promise<string>` — per-ARN in-flight-promise cache;
  a failed promise is dropped from the cache so the next call retries instead of
  being poisoned by a transient error.
- `getCachedSecretJson<T>(arn): Promise<T>` — `JSON.parse` on top of the string
  cache (no separate Secrets Manager call for an ARN already fetched).
- `invalidateSecretCache(arn): void` — **new hook**: drops the cached entry so the
  next call re-fetches from Secrets Manager.

Must be a proper buildable nx project (`project.json` with an `@nx/js:tsc` build
target, `package.json` name `@govtech-bb/aws-secrets`, `tsconfig`), and
`apps/chat/tsconfig.json` must list it in `references`, or the monorepo build
fails with `TS6307`/`TS6059` (per repo CLAUDE.md).

### `apps/chat/src/lib/db/index.ts` — self-heal trio

- `invalidateDb(): void` — sets `dbPromise = null` (forces a fresh `pg.Pool` on
  the next `getDb()`) **and** calls `invalidateSecretCache` for both DB secret
  ARNs (`CHAT_DATABASE_CREDENTIALS_SECRET_ARN`, `CHAT_DATABASE_URL_SECRET_ARN`).
- `isAuthFailure(err): boolean` — true when `err.code === '28P01'` **or**
  `err.cause?.code === '28P01'`. Verified against the installed **drizzle-orm
  0.45.2**: it wraps query errors in `DrizzleQueryError` (message `"Failed query:
  …"`) with the original pg error on `.cause`.
- `withDbAuthRetry(op): Promise<T>` — runs `op(await getDb())`; on `isAuthFailure`,
  calls `invalidateDb()` and retries the op **exactly once**; any other error
  propagates unchanged.

### Consumers

- `apps/chat/src/lib/health.ts` and `apps/chat/src/lib/rag/retrieve.ts` route DB
  calls through `withDbAuthRetry` instead of bare `getDb()`.
- `retrieve.ts` keeps its test seam: when a caller injects a `db` handle directly,
  it bypasses the retry wrapper so injected handles are honored verbatim.

### Removed / migrated

- Delete `apps/chat/src/lib/secrets.ts` (replaced by the package); update imports
  in `db/index.ts` (resolve the stash-pop conflict; reconcile the
  `getCachedJsonSecret` → `getCachedSecretJson` / `getCachedSecret` →
  `getCachedSecretString` naming) and update `apps/chat/SPEC.md`'s reference.

## Data flow

**Steady state (no rotation):** `withDbAuthRetry(op)` → `op(getDb())` → query
succeeds. No added overhead — no extra Secrets Manager calls, no polling.

**Through a rotation:**
1. RDS rotates the master password; the warm Lambda holds the old password in the
   cached secret and the live `pg.Pool`.
2. The next query throws `DrizzleQueryError` with `cause.code === '28P01'`.
3. `withDbAuthRetry` → `isAuthFailure` true → `invalidateDb()` drops the pool and
   the cached master secret.
4. Retry → `getDb()` → `resolveConnectionString()` re-fetches the master secret
   (now the current password) → builds a fresh pool → query succeeds.
5. Recovery is in-place, one request, no redeploy, no `tofu apply`.

## Error handling

- Retry runs **at most once**: a second `28P01` (or any other error) propagates,
  so a genuinely-wrong credential surfaces as an error rather than looping.
- Non-auth errors (timeouts, SQL errors) pass straight through — `invalidateDb`
  only fires on `28P01`.
- A failed *secret fetch* self-evicts from the cache (existing behavior), so an
  `AccessDenied`-type failure is not cached permanently (it still needs the
  compute-role grant — see prod-infra dependency).
- Self-heal only helps on the **master-secret path**. On the legacy
  derived-secret path, re-resolving still reads the stale derived URL, so prod
  benefits only once the held infra promotion ships.

## Verification ladder

**Tier 1 — Unit (local, no DB).**
- Package (`secrets.spec.ts`, largely written): hit, per-ARN cache, shared
  in-flight call, missing `SecretString` throws, failed-promise self-evicts, JSON
  parse + typing, and `invalidateSecretCache` forces a re-fetch.
- New `db/index.ts` tests for `withDbAuthRetry`: (a) success, no retry; (b)
  `28P01` on `err.cause.code` → invalidate → retry succeeds; (c) `28P01` twice →
  throws (retry capped at one); (d) non-auth error passes through; (e)
  `invalidateDb` nulls `dbPromise` and invalidates both ARNs. Wrapped-cause shape
  mirrors real `DrizzleQueryError`.

**Tier 2 — Local integration against real pgvector (`docker-compose` `postgres`,
`pgvector/pgvector:pg16`).**
- Drive chat through the master-secret path (set
  `CHAT_DATABASE_CREDENTIALS_SECRET_ARN` + `HOST/PORT/NAME`) with
  `@govtech-bb/aws-secrets` mocked to return creds from a test-controlled variable
  pointing at local pg — the AWS fetch is the only fake.
- Simulate a rotation: `ALTER ROLE … PASSWORD …` on local pg + flip the mocked
  creds. The stale pool's next query throws a real `28P01` from real
  node-postgres, wrapped by real drizzle 0.45.2; assert `withDbAuthRetry`
  invalidates, re-resolves, and reconnects.
- Proves the whole mechanism end-to-end with no AWS; definitive check that
  `isAuthFailure` sees the real wrapped error.

**Tier 3 — Live rotation on sandbox (final gate).** Validates the AWS-specific
pieces local cannot: real RDS-managed rotation (timing, JSON shape,
`AWSCURRENT`/`AWSPREVIOUS` labels), the compute-role `GetSecretValue`/KMS grant,
and Amplify SSR warm-container behavior.
1. Land on `sandbox`; rebuild chat; confirm `chat.sandbox/api/health` →
   200/connected.
2. `rotate-secret --rotate-immediately` on the sandbox RDS master — no `tofu
   apply`.
3. Poll health: must recover in place within seconds, no redeploy.
4. Re-derive the sandbox legacy secret afterward (cleanup for the ingest task,
   which still reads the derived secret).

**Build gate** (per repo CLAUDE.md): `pnpm exec nx run-many -t build
--exclude=landing` and `nx run-many -t test` must pass.

## Rollout / branch flow

- gov-bb trunk is `sandbox`; the PR targets `sandbox`.
- Salvage the good uncommitted files onto a clean branch off `sandbox`; resolve
  the stash-pop conflict; do **not** commit untracked noise (`.superpowers/`,
  `.claude/worktrees/`).
- After sandbox verification (Tier 3) → promote through the normal `sandbox →
  staging → prod` flow.
- **Prod promotion pairs this app fix with the held infra PR** (env vars + IAM
  grant, mirroring staging #386/#387) so prod self-heals end-to-end. Until then
  prod stays on the rotation-fragile legacy path; prod master last rotated
  2026-06-25, next ≈ 2026-07-02.
