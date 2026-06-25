# Chat DB Self-Heal Through RDS Password Rotation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat SSR app recover from an RDS master-password rotation in place (next request, no redeploy, no `tofu apply`) by adding an invalidate-on-`28P01` self-heal, extracted into a shared `@govtech-bb/aws-secrets` package used by chat.

**Architecture:** A new buildable nx library `@govtech-bb/aws-secrets` provides a per-ARN Secrets Manager cache plus an `invalidateSecretCache(arn)` hook. `apps/chat/src/lib/db/index.ts` gains `invalidateDb()` (drops the cached `pg.Pool` + invalidates the cached DB secrets) and `withDbAuthRetry(op)` (on PG `28P01`, invalidate and retry exactly once). `health.ts` and `rag/retrieve.ts` route their read queries through `withDbAuthRetry`.

**Tech Stack:** TypeScript, nx monorepo, pnpm, drizzle-orm 0.45.2 (node-postgres), `pg`, AWS SDK v3 Secrets Manager. Package tests use **vitest**; chat app tests use the **Node.js built-in test runner** (`tsx --test`, files `*.test.ts`).

## Global Constraints

- Use **pnpm** for everything; never `npm` at the repo root. (Per-app scripts invoke `npm run` internally — that's fine; don't change them.)
- New nx library packages must be **buildable** (`project.json` with `@nx/js:tsc`) and referenced via tsconfig `paths`, or the monorepo build fails (`TS6307`/`TS6059`). Mirror `packages/form-types`.
- Package tests: **vitest** (`*.spec.ts`). Chat app tests: **node:test** (`*.test.ts`, `import { test } from "node:test"`, `import assert from "node:assert/strict"`).
- Branch names must not contain `.` or `/` (Amplify preview cert + worktree rules). Use `-`.
- gov-bb trunk is `sandbox`; PRs target `sandbox`.
- Build gate before PR: `pnpm exec nx run-many -t build --exclude=landing` and `pnpm exec nx run-many -t test` must pass.
- drizzle-orm 0.45.2 wraps query errors in `DrizzleQueryError` (message `"Failed query: …"`) with the original pg error on `.cause`; `28P01` detection must check `err.cause?.code`.
- Scope: **chat only**. Do NOT migrate `apps/form_builder` (tracked under EPIC #1423). Do NOT add a TTL or IAM-auth. Do NOT touch infra (the prod env-var + IAM-grant promotion is a separate, already-understood PR).

---

## File Structure

- `packages/aws-secrets/src/secrets.ts` — cache + `invalidateSecretCache` (already written, untracked).
- `packages/aws-secrets/src/index.ts` — barrel export (already written, untracked).
- `packages/aws-secrets/src/secrets.spec.ts` — vitest unit tests (already written, untracked; extend if gaps).
- `packages/aws-secrets/project.json` — **create** (nx build/test/lint targets).
- `packages/aws-secrets/package.json` — **create**.
- `packages/aws-secrets/tsconfig.json` — **create**.
- `packages/aws-secrets/vitest.config.ts` — **create**.
- `tsconfig.base.json` — **modify** (add `@govtech-bb/aws-secrets` path).
- `apps/chat/tsconfig.json` — **modify** (add `@govtech-bb/aws-secrets` path).
- `apps/chat/package.json` — **modify** (add `@govtech-bb/aws-secrets` workspace dep).
- `apps/chat/src/lib/db/index.ts` — **modify** (use package; keep self-heal trio; export `isAuthFailure`).
- `apps/chat/src/lib/health.ts` — **modify** (route through `withDbAuthRetry`).
- `apps/chat/src/lib/rag/retrieve.ts` — **modify** (route through `withDbAuthRetry`).
- `apps/chat/src/lib/secrets.ts` — **delete** (replaced by the package).
- `apps/chat/src/lib/db/auth-retry.test.ts` — **create** (node:test unit test for `isAuthFailure`).
- `apps/chat/src/lib/db/self-heal.integration.test.ts` — **create** (node:test, gated local pgvector test).
- `apps/chat/SPEC.md` — **modify** (update the `src/lib/secrets.ts` reference).

---

## Task 1: Clean branch + scaffold the `@govtech-bb/aws-secrets` package

**Files:**
- Create: `packages/aws-secrets/project.json`, `packages/aws-secrets/package.json`, `packages/aws-secrets/tsconfig.json`, `packages/aws-secrets/vitest.config.ts`
- Pre-existing (untracked, keep as-is): `packages/aws-secrets/src/secrets.ts`, `packages/aws-secrets/src/index.ts`, `packages/aws-secrets/src/secrets.spec.ts`
- Modify: `tsconfig.base.json`

**Interfaces:**
- Produces: package `@govtech-bb/aws-secrets` exporting `getCachedSecretString(arn: string): Promise<string>`, `getCachedSecretJson<T = Record<string, unknown>>(arn: string): Promise<T>`, `invalidateSecretCache(arn: string): void`.

- [ ] **Step 1: Preserve any WIP, then create a clean branch off `sandbox`**

The current `gov-bb` working tree is mid-`stash pop` with a conflict in `apps/chat/src/lib/db/index.ts` and modified `health.ts`/`retrieve.ts`. Back it up, then branch from the up-to-date trunk. The untracked `packages/aws-secrets/src/*` files are kept; untracked `.superpowers/` and `.claude/worktrees/` are left uncommitted.

```bash
cd /Users/christophercorbin/newalpha/gov-bb
git stash push -u -m "wip-chat-self-heal-backup" -- apps/chat/src/lib/db/index.ts apps/chat/src/lib/health.ts apps/chat/src/lib/rag/retrieve.ts || true
git fetch origin sandbox
git checkout -b fix-chat-db-self-heal-rotation origin/sandbox
```

- [ ] **Step 2: Confirm the package source files are present and unchanged**

Run: `ls packages/aws-secrets/src && head -20 packages/aws-secrets/src/index.ts`
Expected: `index.ts  secrets.spec.ts  secrets.ts`, and `index.ts` re-exports `getCachedSecretJson`, `getCachedSecretString`, `invalidateSecretCache` from `./secrets.js`. If absent, restore them from the design (see spec); they are the canonical implementation.

- [ ] **Step 3: Create `packages/aws-secrets/package.json`**

```json
{
  "name": "@govtech-bb/aws-secrets",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.1057.0"
  },
  "devDependencies": {
    "lint-staged": "^16.4.0"
  },
  "lint-staged": {
    "*.ts": "npx prettier --write"
  }
}
```

- [ ] **Step 4: Create `packages/aws-secrets/project.json`**

```json
{
  "name": "aws-secrets",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/aws-secrets/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/aws-secrets",
        "tsConfig": "packages/aws-secrets/tsconfig.json",
        "main": "packages/aws-secrets/src/index.ts"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "vitest run",
        "cwd": "packages/aws-secrets"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "options": {
        "lintFilePatterns": ["packages/aws-secrets/**/*.ts"]
      }
    }
  },
  "tags": []
}
```

- [ ] **Step 5: Create `packages/aws-secrets/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "declaration": true,
    "module": "commonjs",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 6: Create `packages/aws-secrets/vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@govtech-bb\/(.*)$/,
        replacement: r("../../packages") + "/$1/src/index.ts",
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
```

- [ ] **Step 7: Register the path in `tsconfig.base.json`**

Add this line to `compilerOptions.paths` (alongside the other `@govtech-bb/*` entries near line 23-29):

```jsonc
"@govtech-bb/aws-secrets": ["packages/aws-secrets/src/index.ts"],
```

- [ ] **Step 8: Install so the workspace links the new package**

Run: `pnpm install`
Expected: completes; `@govtech-bb/aws-secrets` is now a known workspace package.

- [ ] **Step 9: Build and test the package in isolation**

Run: `pnpm exec nx run aws-secrets:build && pnpm exec nx run aws-secrets:test`
Expected: build emits `dist/packages/aws-secrets`; vitest reports all `secrets.spec.ts` tests passing (hit, per-ARN cache, shared in-flight call, missing `SecretString` throws, failed-promise self-evicts, JSON parse + typing).

- [ ] **Step 10: Verify the spec covers `invalidateSecretCache`; add the test if missing**

Run: `grep -n "invalidateSecretCache" packages/aws-secrets/src/secrets.spec.ts`
If there is no test asserting that invalidation forces a re-fetch, add this to `secrets.spec.ts`:

```ts
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
});
```

Then re-run: `pnpm exec nx run aws-secrets:test` — Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/aws-secrets tsconfig.base.json pnpm-lock.yaml
git commit -m "feat(aws-secrets): buildable shared Secrets Manager package with invalidate hook"
```

---

## Task 2: Migrate chat's DB layer onto the package + self-heal trio

**Files:**
- Modify: `apps/chat/src/lib/db/index.ts`
- Modify: `apps/chat/tsconfig.json`, `apps/chat/package.json`
- Delete: `apps/chat/src/lib/secrets.ts`
- Modify: `apps/chat/SPEC.md`

**Interfaces:**
- Consumes: `getCachedSecretString`, `getCachedSecretJson`, `invalidateSecretCache` from `@govtech-bb/aws-secrets`.
- Produces (from `apps/chat/src/lib/db/index.ts`):
  - `getDb(): Promise<Database>`
  - `hasDatabase(): boolean`
  - `invalidateDb(): void`
  - `isAuthFailure(err: unknown): boolean` (exported for unit testing)
  - `withDbAuthRetry<T>(op: (db: Database) => Promise<T>): Promise<T>`
  - `type Database`, `schema`

- [ ] **Step 1: Add the workspace dependency to `apps/chat/package.json`**

In the `dependencies` block (alphabetically among the `@govtech-bb/*` entries), add:

```jsonc
"@govtech-bb/aws-secrets": "workspace:*",
```

- [ ] **Step 2: Add the tsconfig path in `apps/chat/tsconfig.json`**

In `compilerOptions.paths`, alongside the existing `@govtech-bb/form-types` entry, add:

```jsonc
"@govtech-bb/aws-secrets": ["../../packages/aws-secrets/src/index.ts"],
```

- [ ] **Step 3: Rewrite the imports + resolve path in `apps/chat/src/lib/db/index.ts`**

Replace the top of the file (the conflicted import block + the two `getCachedJsonSecret`/`getCachedSecret` call sites) so it uses the package. The final header and `resolveConnectionString` are:

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  getCachedSecretJson,
  getCachedSecretString,
  invalidateSecretCache,
} from "@govtech-bb/aws-secrets";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };
let dbPromise: Promise<Database> | null = null;
```

In `resolveConnectionString`, change the master-secret call from `getCachedJsonSecret<…>(credsArn)` to `getCachedSecretJson<…>(credsArn)`, and the legacy call from `getCachedSecret(arn)` to `getCachedSecretString(arn)`. The rest of the function (priority order, URL format, error message) is unchanged.

- [ ] **Step 4: Keep the self-heal trio and export `isAuthFailure`**

`invalidateDb`, `withDbAuthRetry`, and `isAuthFailure` already exist in the working-tree version. Ensure they are present and that `isAuthFailure` is **exported** (add `export` to its declaration) for unit testing. Final forms:

```ts
export function invalidateDb(): void {
  dbPromise = null;
  for (const arn of [
    process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN,
    process.env.CHAT_DATABASE_URL_SECRET_ARN,
  ]) {
    if (arn) invalidateSecretCache(arn);
  }
}

export function isAuthFailure(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "28P01") return true;
  const cause = (err as { cause?: unknown } | null)?.cause;
  return (cause as { code?: unknown } | null)?.code === "28P01";
}

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

(`getDb`, the SSL handling, and `export { schema }` are unchanged from the current file.)

- [ ] **Step 5: Delete the old per-app secrets helper**

```bash
git rm apps/chat/src/lib/secrets.ts
```

- [ ] **Step 6: Verify nothing else imports the deleted file**

Run: `grep -rn -E "lib/secrets|\.\./secrets|\./secrets" apps/chat/src | grep -v "secrets.spec\|aws-secrets"`
Expected: **no output** (only `db/index.ts` referenced it, and it now uses the package).

- [ ] **Step 7: Update `apps/chat/SPEC.md`**

Find the `Shared Utilities` row referencing `src/lib/secrets.ts` and replace that reference with `@govtech-bb/aws-secrets`. Run `grep -n "lib/secrets.ts" apps/chat/SPEC.md` first to locate it; expected after edit: no remaining `src/lib/secrets.ts` reference.

- [ ] **Step 8: Type-check / build chat**

Run: `pnpm install && pnpm exec nx run chat:build`
Expected: chat builds; no unresolved `@govtech-bb/aws-secrets`, no leftover `../secrets` import errors.

- [ ] **Step 9: Commit**

```bash
git add apps/chat/src/lib/db/index.ts apps/chat/tsconfig.json apps/chat/package.json apps/chat/SPEC.md pnpm-lock.yaml
git commit -m "refactor(chat): resolve DB creds via @govtech-bb/aws-secrets; keep 28P01 self-heal"
```

---

## Task 3: Unit-test the `28P01` detection (node:test)

**Files:**
- Create: `apps/chat/src/lib/db/auth-retry.test.ts`

**Interfaces:**
- Consumes: `isAuthFailure` from `#/lib/db`.

- [ ] **Step 1: Write the failing test**

Mirror the real `DrizzleQueryError` shape (message `"Failed query: …"`, original pg error on `.cause`) and a bare pg error.

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
  assert.equal(isAuthFailure(Object.assign(new Error("x"), { code: "28P01" })), true);
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

- [ ] **Step 2: Run it to verify it fails (if `isAuthFailure` isn't exported yet)**

Run: `cd apps/chat && npx tsx --test "src/lib/db/auth-retry.test.ts"`
Expected: FAIL with an import/export error for `isAuthFailure` if Task 2 Step 4's `export` was missed — otherwise PASS. (If it already passes, the export landed in Task 2; proceed.)

- [ ] **Step 3: Ensure `isAuthFailure` is exported (done in Task 2) and rerun**

Run: `cd apps/chat && npx tsx --test "src/lib/db/auth-retry.test.ts"`
Expected: PASS — all four tests.

- [ ] **Step 4: Commit**

```bash
git add apps/chat/src/lib/db/auth-retry.test.ts
git commit -m "test(chat): isAuthFailure detects bare + drizzle-wrapped 28P01"
```

---

## Task 4: Local integration test — full self-heal loop against real pgvector (gated)

This is Tier 2 of the verification ladder. It runs against the local `docker-compose` `postgres` service, exercises **real** node-postgres + drizzle (so the `28P01` is real, not synthesized), and is **skipped unless `CHAT_DB_IT=1`** so it never breaks CI.

**Files:**
- Create: `apps/chat/src/lib/db/self-heal.integration.test.ts`

**Interfaces:**
- Consumes: `withDbAuthRetry` from `#/lib/db`, `sql` from `drizzle-orm`, `pg` (admin connection).

- [ ] **Step 1: Write the integration test**

It uses the **`CHAT_DATABASE_URL` direct path** (priority #1 in `resolveConnectionString`), which exercises pool-rebuild + re-resolve + real `28P01` + `isAuthFailure` without needing AWS. A separate admin pool rotates a dedicated role's password and terminates its live backends (Postgres keeps existing sessions valid after a password change, so reauth must be forced on a fresh connection).

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
    // Force the master-secret-free direct path; clear the others.
    delete process.env.DATABASE_URL;
    delete process.env.CHAT_DATABASE_CREDENTIALS_SECRET_ARN;
    delete process.env.CHAT_DATABASE_URL_SECRET_ARN;
    process.env.CHAT_DATABASE_URL = `postgres://${ROLE}:${PW_V1}@localhost:5432/chat`;

    // Import AFTER env is set so the module's lazy getDb() sees it.
    const { withDbAuthRetry } = await import("./index.ts");

    const first = await withDbAuthRetry((db) => db.execute(sql`select 1 as ok`));
    assert.equal(first.rows[0].ok, 1, "baseline query works on v1");

    // Rotate: change the role password, point the env at the new one, and kill
    // the live session so the pool must reauthenticate on its next connection.
    await admin.query(`ALTER ROLE ${ROLE} PASSWORD '${PW_V2}'`);
    process.env.CHAT_DATABASE_URL = `postgres://${ROLE}:${PW_V2}@localhost:5432/chat`;
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${ROLE}'`,
    );

    // The stale pool's next query hits 28P01; withDbAuthRetry must invalidate,
    // re-resolve (now v2), rebuild the pool, and succeed — no redeploy.
    const healed = await withDbAuthRetry((db) => db.execute(sql`select 1 as ok`));
    assert.equal(healed.rows[0].ok, 1, "query self-heals on the new password");
  },
);
```

- [ ] **Step 2: Confirm it SKIPS cleanly with no DB (CI-safe)**

Run: `cd apps/chat && npx tsx --test "src/lib/db/self-heal.integration.test.ts"`
Expected: the test reports as **skipped** (no `CHAT_DB_IT`), exit 0 — proving it won't break CI.

- [ ] **Step 3: Bring up local Postgres and run it for real**

```bash
cd /Users/christophercorbin/newalpha/gov-bb
docker compose up -d postgres
# wait for healthy
until docker compose exec -T postgres pg_isready -U postgres -d chat >/dev/null 2>&1; do sleep 1; done
cd apps/chat && CHAT_DB_IT=1 npx tsx --test "src/lib/db/self-heal.integration.test.ts"
```

Expected: PASS — both assertions (`baseline query works on v1`, `query self-heals on the new password`). This is the definitive local proof that a real drizzle-wrapped `28P01` triggers the re-resolve + reconnect.

- [ ] **Step 4: Commit**

```bash
git add apps/chat/src/lib/db/self-heal.integration.test.ts
git commit -m "test(chat): local pgvector integration proving in-place self-heal on rotation"
```

---

## Task 5: Full build/test gate + open PR to `sandbox`

**Files:** none (verification + PR).

- [ ] **Step 1: Run the monorepo build gate**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: all projects (including `aws-secrets` and `chat`) build with no errors. (`landing` is excluded because its prebuild fetches a live API and fails offline — CI builds it.)

- [ ] **Step 2: Run the full test suite**

Run: `pnpm exec nx run-many -t test`
Expected: PASS, including `aws-secrets` (vitest) and `chat` (node:test). The integration test skips (no `CHAT_DB_IT`).

- [ ] **Step 3: Push and open the PR (targets `sandbox`)**

```bash
git push -u origin fix-chat-db-self-heal-rotation
gh pr create -R govtech-bb/gov-bb --base sandbox --head fix-chat-db-self-heal-rotation \
  --title "fix(chat): self-heal DB through RDS password rotation (#1478)" \
  --assignee @me \
  --label bug --label area:backend --label subsystem:packages \
  --body "Implements docs/superpowers/specs/2026-06-25-chat-db-self-heal-rotation-design.md. invalidate-on-28P01 self-heal via new @govtech-bb/aws-secrets package (chat only). Closes #1478. Verified: unit (isAuthFailure bare + drizzle-wrapped), package vitest (invalidate forces re-fetch), local pgvector integration (real rotation self-heal). Live sandbox rotation test to follow post-merge. Pairs with the held alpha-infra prod promotion for prod to self-heal end-to-end."
```

Expected: PR created against `sandbox`. (Confirm labels exist via `gh label list` first; drop any that don't.)

- [ ] **Step 4: Confirm CI is green on the PR**

Run: `gh pr checks <number> -R govtech-bb/gov-bb`
Expected: build + test checks pass.

---

## Task 6: Tier 3 — live rotation verification on sandbox (post-merge, ops)

This is the final gate from the spec. It runs after the PR merges to `sandbox` and the sandbox chat app is rebuilt. Sandbox is already on the master-secret path (`CHAT_DATABASE_CREDENTIALS_SECRET_ARN`), so this exercises the real AWS path. **Profile:** `govtech-sandbox`; **region:** `ca-central-1`.

- [ ] **Step 1: Rebuild sandbox chat after merge**

Find the sandbox chat Amplify app id, then trigger a RELEASE build:

```bash
aws amplify list-apps --profile govtech-sandbox --region ca-central-1 \
  --query "apps[?contains(name,'chat')].{name:name,appId:appId}" --output json
aws amplify start-job --profile govtech-sandbox --region ca-central-1 \
  --app-id <APP_ID> --branch-name sandbox --job-type RELEASE
```

Wait for `SUCCEED` (poll `aws amplify get-job ... --query job.summary.status`).

- [ ] **Step 2: Confirm baseline health**

Run: `curl -s https://chat.sandbox.alpha.gov.bb/api/health`
Expected: `{"ok":true,"db":"connected",...}` (HTTP 200).

- [ ] **Step 3: Rotate the sandbox RDS master — NO tofu apply**

```bash
MASTER=$(aws rds describe-db-instances --profile govtech-sandbox --region ca-central-1 \
  --query "DBInstances[?contains(DBInstanceIdentifier,'vector')].MasterUserSecret.SecretArn | [0]" --output text)
aws secretsmanager rotate-secret --profile govtech-sandbox --region ca-central-1 \
  --secret-id "$MASTER" --rotate-immediately
```

Wait until `LastRotatedDate` advances (poll `describe-secret`).

- [ ] **Step 4: Confirm in-place self-heal (the acceptance criterion)**

Poll health for ~2 minutes:

```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " https://chat.sandbox.alpha.gov.bb/api/health; sleep 10; done; echo
```

Expected: returns to `200` (and `"db":"connected"`) **without any redeploy or tofu apply** — within seconds of the first post-rotation request, not the ~5-minute stuck behavior seen pre-fix. This is the pass/fail gate.

- [ ] **Step 5: Cleanup — re-sync the sandbox legacy derived secret for the ingest task**

The `chatbot-ingest` ECS task still reads the derived secret, now stale. Re-derive it:

```bash
gh workflow run deploy-sandbox-simple-service-builder.yml -R govtech-bb/alpha-infra -f action=apply
```

(If no such sandbox workflow exists, dispatch the sandbox SSB apply equivalent; confirm `sandbox/chatbot/database-url` `LastChangedDate` updates.)

- [ ] **Step 6: Record the result and hand off promotion**

If Step 4 passed, the fix is verified. Promote `sandbox → staging` via the normal flow. **Prod promotion must pair this app fix with the held alpha-infra prod-infra PR** (env vars + IAM grant, mirroring staging #386/#387) so prod lands fully protected; prod's master last rotated 2026-06-25, next ≈ 2026-07-02.

---

## Self-Review

- **Spec coverage:** package + `invalidateSecretCache` (Task 1); `withDbAuthRetry`/`invalidateDb`/`isAuthFailure` + migration + delete old file (Task 2); Tier 1 unit (Tasks 1 Step 10, 3); Tier 2 local integration (Task 4); build gate (Task 5); Tier 3 live rotation + ingest cleanup + promotion sequencing (Task 6); chat-only scope + form_builder excluded (Global Constraints). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; all code blocks complete; `<APP_ID>`/`<number>` are runtime lookups with the exact commands to obtain them, not unspecified logic.
- **Type consistency:** `getCachedSecretString`/`getCachedSecretJson`/`invalidateSecretCache` used identically in Tasks 1–2; `isAuthFailure`/`withDbAuthRetry`/`invalidateDb` signatures match between Task 2 (produces) and Tasks 3–4 (consume).
