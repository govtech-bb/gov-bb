# Chat DB Self-Heal Through RDS Password Rotation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat SSR app recover from an RDS master-password rotation in place (next request, no redeploy, no `tofu apply`) by adding an invalidate-on-`28P01` self-heal.

**Architecture:** `@govtech-bb/aws-secrets` (already on `sandbox`) gains an `invalidateSecretCache(arn)` hook. `apps/chat/src/lib/db/index.ts` (already using that package) gains `invalidateDb()` (drops the cached `pg.Pool` + invalidates the cached DB secrets) and `withDbAuthRetry(op)` (on PG `28P01`, invalidate and retry exactly once). `health.ts` and `rag/retrieve.ts` route their read queries through `withDbAuthRetry`.

**Tech Stack:** TypeScript, nx monorepo, pnpm, drizzle-orm 0.45.2 (node-postgres), `pg`, AWS SDK v3 Secrets Manager. Package tests use **vitest**; chat app tests use the **Node.js built-in test runner** (`tsx --test`, files `*.test.ts`).

## Baseline (verified on `origin/sandbox`, 2026-06-25)

- `packages/aws-secrets/` exists and is a built nx project; `src/index.ts` exports `getCachedSecretJson`, `getCachedSecretString` (NO `invalidateSecretCache`).
- `apps/chat/src/lib/db/index.ts` imports `getCachedSecretJson`, `getCachedSecretString` from `@govtech-bb/aws-secrets`; has `resolveConnectionString`, `hasDatabase`, `getDb`; has NO `withDbAuthRetry`/`invalidateDb`/`isAuthFailure`.
- `apps/chat/src/lib/secrets.ts` does NOT exist (already removed).
- `apps/chat/src/lib/health.ts` and `apps/chat/src/lib/rag/retrieve.ts` call `getDb()` directly.

Therefore: package scaffolding and the chat migration are DONE. This plan only adds the self-heal layer + tests + verification.

## Global Constraints

- Use **pnpm** at the repo root; never `npm` (per-app scripts invoke `npm run` internally — leave those).
- Package tests: **vitest** (`*.spec.ts`). Chat app tests: **node:test** (`*.test.ts`, `import { test } from "node:test"`, `import assert from "node:assert/strict"`).
- Branch names: no `.` or `/`; use `-`. gov-bb trunk is `sandbox`; PR targets `sandbox`.
- Build gate before PR: `pnpm exec nx run-many -t build --exclude=landing` and `pnpm exec nx run-many -t test` must pass.
- drizzle-orm 0.45.2 wraps query errors in `DrizzleQueryError` (message `"Failed query: …"`) with the original pg error on `.cause`; `28P01` detection must check `err.cause?.code`.
- Scope: **chat only**. Do NOT migrate `apps/form_builder`. No TTL, no IAM-auth, no infra changes.

---

## File Structure

- `packages/aws-secrets/src/secrets.ts` — **modify** (add `invalidateSecretCache`).
- `packages/aws-secrets/src/index.ts` — **modify** (export `invalidateSecretCache`).
- `packages/aws-secrets/src/secrets.spec.ts` — **modify** (test invalidation).
- `apps/chat/src/lib/db/index.ts` — **modify** (add `invalidateDb`, `isAuthFailure` (exported), `withDbAuthRetry`; import `invalidateSecretCache`).
- `apps/chat/src/lib/health.ts` — **modify** (route through `withDbAuthRetry`).
- `apps/chat/src/lib/rag/retrieve.ts` — **modify** (route through `withDbAuthRetry`).
- `apps/chat/src/lib/db/auth-retry.test.ts` — **create** (node:test unit test for `isAuthFailure`).
- `apps/chat/src/lib/db/self-heal.integration.test.ts` — **create** (node:test, gated local pgvector test).

---

## Task 0 (controller, not an implementer task): clean branch off `sandbox`

Done by the controller before dispatching implementers. Carry the committed spec + plan docs; do not carry the stale local WIP (the package/migration already exist on sandbox).

```bash
cd /Users/christophercorbin/newalpha/gov-bb
git fetch origin sandbox
# preserve the stale WIP as a backup, then leave it behind
git stash push -u -m "stale-chat-self-heal-wip" -- apps/chat/src/lib/db/index.ts apps/chat/src/lib/health.ts apps/chat/src/lib/rag/retrieve.ts packages/aws-secrets || true
git checkout -b fix-chat-db-self-heal-rotation origin/sandbox
# carry the two doc commits (spec + plan) from the old branch
git cherry-pick <spec-commit> <plan-commit>
```

Verify baseline: `grep -n "invalidateSecretCache\|withDbAuthRetry" packages/aws-secrets/src/index.ts apps/chat/src/lib/db/index.ts` → expected: NO matches (confirms we start from the un-self-healed baseline).

---

## Task 1: Add `invalidateSecretCache` to `@govtech-bb/aws-secrets`

**Files:**
- Modify: `packages/aws-secrets/src/secrets.ts`, `packages/aws-secrets/src/index.ts`
- Test: `packages/aws-secrets/src/secrets.spec.ts`

**Interfaces:**
- Produces: `invalidateSecretCache(arn: string): void` — drops the cached entry for `arn` so the next `getCachedSecretString`/`getCachedSecretJson` re-fetches.

- [ ] **Step 1: Write the failing test** — append to `secrets.spec.ts`:

```ts
import { invalidateSecretCache } from "./secrets";

describe("invalidateSecretCache", () => {
  it("forces the next call to re-fetch from Secrets Manager", async () => {
    sendMock
      .mockResolvedValueOnce({ SecretString: "old" })
      .mockResolvedValueOnce({ SecretString: "new" });
    expect(await getCachedSecretString("arn:invalidate:me")).toBe("old");
    invalidateSecretCache("arn:invalidate:me");
    expect(await getCachedSecretString("arn:invalidate:me")).toBe("new");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for an ARN that was never cached", () => {
    expect(() => invalidateSecretCache("arn:never:seen")).not.toThrow();
  });
});
```

(If `getCachedSecretString`/`sendMock` are already imported at the top of the file, do not duplicate those imports — only add the `invalidateSecretCache` import.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx run aws-secrets:test`
Expected: FAIL — `invalidateSecretCache` is not exported.

- [ ] **Step 3: Implement `invalidateSecretCache` in `secrets.ts`**

The module has `const cache = new Map<string, Promise<string>>();`. Add at the end of the file:

```ts
/**
 * Drop the cached value for an ARN so the next call re-fetches from Secrets
 * Manager. Needed when a consumer detects the cached value is stale at use
 * time — e.g. chat hits PG `28P01: password authentication failed` after RDS
 * rotated the master password but the warm container still holds the old one.
 */
export function invalidateSecretCache(arn: string): void {
  cache.delete(arn);
}
```

- [ ] **Step 4: Export it from `index.ts`**

Change the barrel to include the new symbol:

```ts
export {
  getCachedSecretJson,
  getCachedSecretString,
  invalidateSecretCache,
} from "./secrets.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec nx run aws-secrets:test`
Expected: PASS — including the two new invalidation tests and all pre-existing ones.

- [ ] **Step 6: Build the package**

Run: `pnpm exec nx run aws-secrets:build`
Expected: emits `dist/packages/aws-secrets` with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/aws-secrets/src
git commit -m "feat(aws-secrets): add invalidateSecretCache hook"
```

---

## Task 2: Add the self-heal trio to chat's DB layer

**Files:**
- Modify: `apps/chat/src/lib/db/index.ts`
- Test: `apps/chat/src/lib/db/auth-retry.test.ts` (create)

**Interfaces:**
- Consumes: `invalidateSecretCache` from `@govtech-bb/aws-secrets` (Task 1).
- Produces (from `apps/chat/src/lib/db/index.ts`):
  - `invalidateDb(): void`
  - `isAuthFailure(err: unknown): boolean` (exported)
  - `withDbAuthRetry<T>(op: (db: Database) => Promise<T>): Promise<T>`

- [ ] **Step 1: Write the failing unit test** — create `apps/chat/src/lib/db/auth-retry.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthFailure } from "./index.ts";

// Mirrors drizzle-orm 0.45.2 DrizzleQueryError: a wrapper Error whose `.cause`
// is the original node-postgres error carrying SQLSTATE `.code`.
function drizzleWrapped(code: string): Error {
  const pgErr = Object.assign(new Error("password authentication failed"), {
    code,
  });
  return Object.assign(new Error("Failed query: select 1\nparams: "), {
    cause: pgErr,
  });
}

test("detects 28P01 on a bare pg error (err.code)", () => {
  assert.equal(
    isAuthFailure(Object.assign(new Error("x"), { code: "28P01" })),
    true,
  );
});

test("detects 28P01 wrapped by drizzle (err.cause.code)", () => {
  assert.equal(isAuthFailure(drizzleWrapped("28P01")), true);
});

test("returns false for a non-auth pg error (e.g. 57014 statement_timeout)", () => {
  assert.equal(isAuthFailure(drizzleWrapped("57014")), false);
});

test("returns false for null / undefined / plain errors", () => {
  assert.equal(isAuthFailure(null), false);
  assert.equal(isAuthFailure(undefined), false);
  assert.equal(isAuthFailure(new Error("boom")), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/chat && npx tsx --test "src/lib/db/auth-retry.test.ts"`
Expected: FAIL — `isAuthFailure` is not exported from `./index.ts`.

- [ ] **Step 3: Implement the self-heal trio in `db/index.ts`**

Add `invalidateSecretCache` to the existing import from `@govtech-bb/aws-secrets`:

```ts
import {
  getCachedSecretJson,
  getCachedSecretString,
  invalidateSecretCache,
} from "@govtech-bb/aws-secrets";
```

Then add, after `getDb()` (which returns `dbPromise`, the cached pool) and before `export { schema };`:

```ts
/**
 * Drop the cached pool + cached credentials so the next `getDb()` re-resolves
 * the connection string from Secrets Manager and rebuilds the pool with the
 * fresh password. Called by `withDbAuthRetry` when a query fails with PG
 * `28P01` after an RDS master-password rotation.
 */
export function invalidateDb(): void {
  dbPromise = null;
  for (const arn of [
    process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN,
    process.env.CHAT_DATABASE_URL_SECRET_ARN,
  ]) {
    if (arn) invalidateSecretCache(arn);
  }
}

/**
 * PG SQLSTATE 28P01 — `invalid_password`. After an RDS master-password
 * rotation, the warm Lambda holds the old password in both the secrets cache
 * and the pg.Pool's connection string; the first query on the stale pool fails
 * with 28P01. drizzle wraps the pg error, so check `err.cause.code` too.
 */
export function isAuthFailure(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "28P01") return true;
  const cause = (err as { cause?: unknown } | null)?.cause;
  return (cause as { code?: unknown } | null)?.code === "28P01";
}

/**
 * Wrap a DB operation so it transparently survives an RDS master-password
 * rotation. On PG `28P01`, drop the cached pool + secret and retry the
 * operation once with a freshly-resolved connection string. Any other error
 * propagates unchanged. The retry runs at most once per call.
 */
export async function withDbAuthRetry<T>(
  op: (db: Database) => Promise<T>,
): Promise<T> {
  try {
    return await op(await getDb());
  } catch (err) {
    if (!isAuthFailure(err)) throw err;
    invalidateDb();
    return op(await getDb());
  }
}
```

(`dbPromise` is the module-level `let dbPromise: Promise<Database> | null`; `Database` and `getDb` already exist. Do not change `resolveConnectionString`, `hasDatabase`, or `getDb`.)

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd apps/chat && npx tsx --test "src/lib/db/auth-retry.test.ts"`
Expected: PASS — all four tests.

- [ ] **Step 5: Type-check chat**

Run: `pnpm exec nx run chat:build`
Expected: builds; no unresolved `invalidateSecretCache`, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/chat/src/lib/db/index.ts apps/chat/src/lib/db/auth-retry.test.ts
git commit -m "feat(chat): withDbAuthRetry self-heals DB on RDS 28P01 rotation"
```

---

## Task 3: Route health + retrieve through `withDbAuthRetry`

**Files:**
- Modify: `apps/chat/src/lib/health.ts`, `apps/chat/src/lib/rag/retrieve.ts`

**Interfaces:**
- Consumes: `withDbAuthRetry` from `#/lib/db` (Task 2).

- [ ] **Step 1: Update `health.ts`**

Change the import to bring in `withDbAuthRetry` instead of `getDb`:

```ts
import { hasDatabase, schema, withDbAuthRetry } from "#/lib/db";
```

In `checkHealth`, replace the body that does `const db = await getDb(); …; return {ok:true,…}` so the whole read sequence runs inside the wrapper, returning the same `HealthReport` shape:

```ts
return await withDbAuthRetry(async (db) => {
  const [docs] = await db
    .select({ count: count(), updated: max(schema.documents.updatedAt) })
    .from(schema.documents);
  const [chunks] = await db.select({ count: count() }).from(schema.chunks);
  const [run] = await db
    .select({
      status: schema.ingestRuns.status,
      startedAt: schema.ingestRuns.startedAt,
      finishedAt: schema.ingestRuns.finishedAt,
      errorMessage: schema.ingestRuns.errorMessage,
    })
    .from(schema.ingestRuns)
    .orderBy(desc(schema.ingestRuns.startedAt))
    .limit(1);
  return {
    ok: true as const,
    db: "connected" as const,
    docCount: docs?.count ?? 0,
    chunkCount: chunks?.count ?? 0,
    lastUpdatedAt: docs?.updated?.toISOString() ?? null,
    lastIngest: run
      ? {
          status: run.status,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          error: run.errorMessage,
        }
      : null,
  };
});
```

The existing `try/catch` that logs `health.db_check_failed` and returns `{ok:false,db:"disconnected",…}` stays as the outer wrapper — a `28P01` that survives the one retry, or any other failure, still lands there.

- [ ] **Step 2: Update `rag/retrieve.ts`**

Change the import:

```ts
import { withDbAuthRetry, type Database } from "#/lib/db";
```

In `searchByVector`, wrap the query so an injected `db` bypasses the retry (test seam) and production callers self-heal. Replace the `const database = db ?? (await getDb()); … const res = await database.execute(...)` block with:

```ts
const literal = JSON.stringify(vector);
const runQuery = (database: Database) =>
  database.execute<RetrieveRow>(sql`
    <KEEP THE EXISTING QUERY EXACTLY AS-IS>
  `);
// Tests inject a `db` directly — skip the retry wrapper so the injected handle
// is honored verbatim. Production callers go through withDbAuthRetry so a
// mid-life RDS password rotation triggers exactly one re-resolve + retry.
const res = db ? await runQuery(db) : await withDbAuthRetry(runQuery);
```

Do not alter the SQL text, `rowsToResult(...)` call, or the function signature.

- [ ] **Step 3: Type-check + run chat unit tests**

Run: `pnpm exec nx run chat:build && (cd apps/chat && npm test)`
Expected: builds; `npm test` passes (the integration test added in Task 4 is not present yet; existing retrieve tests that inject `db` still pass because the seam is preserved).

- [ ] **Step 4: Commit**

```bash
git add apps/chat/src/lib/health.ts apps/chat/src/lib/rag/retrieve.ts
git commit -m "feat(chat): route health + RAG retrieve through withDbAuthRetry"
```

---

## Task 4: Local integration test — full self-heal loop against real pgvector (gated)

Tier 2 of the verification ladder. Runs against the local `docker-compose` `postgres` service, exercises **real** node-postgres + drizzle (real `28P01`), and is **skipped unless `CHAT_DB_IT=1`** so it never breaks CI.

> **Trigger mechanism (revised):** do NOT use `pg_terminate_backend` — terminating a pooled connection yields PG `57P02` ("terminating connection"), a *test artifact* not the production rotation signal, and emits an unhandled pool `'error'` (which would force a production pool-listener we don't want). Instead trigger a genuine `28P01` the way production does: after the baseline query, `ALTER ROLE` the password + point `CHAT_DATABASE_URL` at the new one, then **wait past the pool's idle timeout (~11s; node-postgres default `idleTimeoutMillis` is 10s)** so the warm connection closes; the next query opens a fresh connection that dials with the stale connection string → real `28P01` → `withDbAuthRetry` self-heals. Self-heal stays scoped to `28P01` only — no production-code changes in this task. Cleanup must `DROP OWNED BY` the role before `DROP ROLE` (else `2BP01`).

**Files:**
- Create: `apps/chat/src/lib/db/self-heal.integration.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";

const RUN = process.env.CHAT_DB_IT === "1";
const ADMIN_URL =
  process.env.CHAT_IT_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/chat";
const ROLE = "selfheal_it";
const PW_V1 = "pw_v1";
const PW_V2 = "pw_v2";

let admin: pg.Pool;

before(async () => {
  if (!RUN) return;
  admin = new pg.Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await admin.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${PW_V1}'`);
  await admin.query(`GRANT CONNECT ON DATABASE chat TO ${ROLE}`);
});

after(async () => {
  if (!RUN) return;
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${ROLE}'`,
  );
  await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
  await admin.end();
});

test(
  "self-heals after a password rotation: stale pool -> 28P01 -> re-resolve -> reconnect",
  { skip: !RUN ? "set CHAT_DB_IT=1 and run docker compose up postgres" : false },
  async () => {
    delete process.env.DATABASE_URL;
    delete process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN;
    delete process.env.CHAT_DATABASE_URL_SECRET_ARN;
    process.env.CHAT_DATABASE_URL = `postgres://${ROLE}:${PW_V1}@localhost:5432/chat`;

    // Import AFTER env is set so the module's lazy getDb() sees it.
    const { withDbAuthRetry } = await import("./index.ts");

    const first = await withDbAuthRetry((db) => db.execute(sql`select 1 as ok`));
    assert.equal(first.rows[0].ok, 1, "baseline query works on v1");

    // Rotate: change the role password, point env at the new one, and kill the
    // live session so the pool must reauthenticate on its next connection.
    await admin.query(`ALTER ROLE ${ROLE} PASSWORD '${PW_V2}'`);
    process.env.CHAT_DATABASE_URL = `postgres://${ROLE}:${PW_V2}@localhost:5432/chat`;
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${ROLE}'`,
    );

    const healed = await withDbAuthRetry((db) => db.execute(sql`select 1 as ok`));
    assert.equal(healed.rows[0].ok, 1, "query self-heals on the new password");
  },
);
```

- [ ] **Step 2: Confirm it SKIPS cleanly with no DB (CI-safe)**

Run: `cd apps/chat && npx tsx --test "src/lib/db/self-heal.integration.test.ts"`
Expected: reported **skipped**, exit 0.

- [ ] **Step 3: Bring up local Postgres and run it for real**

```bash
cd /Users/christophercorbin/newalpha/gov-bb
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U postgres -d chat >/dev/null 2>&1; do sleep 1; done
cd apps/chat && CHAT_DB_IT=1 npx tsx --test "src/lib/db/self-heal.integration.test.ts"
```

Expected: PASS — both assertions. Definitive local proof a real drizzle-wrapped `28P01` triggers re-resolve + reconnect.

- [ ] **Step 4: Commit**

```bash
git add apps/chat/src/lib/db/self-heal.integration.test.ts
git commit -m "test(chat): local pgvector integration proving in-place self-heal on rotation"
```

---

## Task 5: Full build/test gate + open PR to `sandbox`

- [ ] **Step 1: Build gate** — Run: `pnpm exec nx run-many -t build --exclude=landing` — Expected: all projects build.
- [ ] **Step 2: Test suite** — Run: `pnpm exec nx run-many -t test` — Expected: PASS (`aws-secrets` vitest + `chat` node:test; the integration test skips).
- [ ] **Step 3: Push + PR (targets `sandbox`)**

```bash
git push -u origin fix-chat-db-self-heal-rotation
gh pr create -R govtech-bb/gov-bb --base sandbox --head fix-chat-db-self-heal-rotation \
  --title "fix(chat): self-heal DB through RDS password rotation (#1478)" \
  --assignee @me \
  --body "Implements docs/superpowers/specs/2026-06-25-chat-db-self-heal-rotation-design.md. Adds invalidateSecretCache to @govtech-bb/aws-secrets and withDbAuthRetry (invalidate-on-28P01) to chat's DB layer; routes health + RAG retrieve through it. Closes #1478. Verified: unit (isAuthFailure bare + drizzle-wrapped), package vitest (invalidate forces re-fetch), local pgvector integration (real rotation self-heal). Live sandbox rotation test to follow post-merge. Pairs with the held alpha-infra prod promotion for prod to self-heal end-to-end."
```

(Confirm labels via `gh label list`; add `bug`, `area:backend`, `subsystem:packages` if present.)

- [ ] **Step 4: Confirm CI green** — Run: `gh pr checks <number> -R govtech-bb/gov-bb`.

---

## Task 6: Tier 3 — live rotation verification on sandbox (post-merge, ops)

Runs after merge to `sandbox` + a sandbox chat rebuild. Sandbox is on the master-secret path, so this exercises the real AWS path. **Profile:** `govtech-sandbox`; **region:** `ca-central-1`.

- [ ] **Step 1: Rebuild sandbox chat** — find the app id and trigger a build:

```bash
aws amplify list-apps --profile govtech-sandbox --region ca-central-1 \
  --query "apps[?contains(name,'chat')].{name:name,appId:appId}" --output json
aws amplify start-job --profile govtech-sandbox --region ca-central-1 \
  --app-id <APP_ID> --branch-name sandbox --job-type RELEASE
```

Wait for `SUCCEED`.

- [ ] **Step 2: Baseline** — `curl -s https://chat.sandbox.alpha.gov.bb/api/health` → `{"ok":true,"db":"connected",...}`.

- [ ] **Step 3: Rotate the sandbox RDS master (NO tofu apply)**

```bash
MASTER=$(aws rds describe-db-instances --profile govtech-sandbox --region ca-central-1 \
  --query "DBInstances[?contains(DBInstanceIdentifier,'vector')].MasterUserSecret.SecretArn | [0]" --output text)
aws secretsmanager rotate-secret --profile govtech-sandbox --region ca-central-1 \
  --secret-id "$MASTER" --rotate-immediately
```

Wait until `LastRotatedDate` advances.

- [ ] **Step 4: Confirm in-place self-heal (pass/fail gate)**

```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " https://chat.sandbox.alpha.gov.bb/api/health; sleep 10; done; echo
```

Expected: returns to `200`/`"db":"connected"` within seconds of the first post-rotation request, **no redeploy, no tofu apply** — vs the ~5-min stuck behavior pre-fix.

- [ ] **Step 5: Cleanup** — re-derive the sandbox legacy secret for the ingest task (dispatch the sandbox SSB apply in alpha-infra; confirm `sandbox/chatbot/database-url` `LastChangedDate` updates).

- [ ] **Step 6: Handoff** — promote `sandbox → staging`. **Prod promotion pairs this app fix with the held alpha-infra prod-infra PR** (env vars + IAM grant, mirroring staging #386/#387). Prod master last rotated 2026-06-25; next ≈ 2026-07-02.

---

## Self-Review

- **Spec coverage:** `invalidateSecretCache` (Task 1); `withDbAuthRetry`/`invalidateDb`/`isAuthFailure` (Task 2); health + retrieve routing (Task 3); Tier 1 unit (Tasks 1, 2); Tier 2 local integration (Task 4); build gate + PR (Task 5); Tier 3 live rotation + cleanup + promotion (Task 6). form_builder excluded (Global Constraints). All spec sections map to a task.
- **Placeholder scan:** the only bracketed tokens are runtime lookups (`<APP_ID>`, `<number>`, `<spec-commit>`/`<plan-commit>`) and the explicit `<KEEP THE EXISTING QUERY EXACTLY AS-IS>` directive in Task 3 Step 2, which instructs preserving existing code verbatim rather than rewriting it.
- **Type consistency:** `invalidateSecretCache` (Task 1 produces → Task 2 consumes); `isAuthFailure`/`withDbAuthRetry`/`invalidateDb` (Task 2 produces → Tasks 3, 4 consume) — signatures match.
