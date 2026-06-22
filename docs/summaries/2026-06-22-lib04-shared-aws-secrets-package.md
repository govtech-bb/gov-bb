# LIB-04 — shared @govtech-bb/aws-secrets package

## Context

The Amplify-Compute secret-resolution pattern (bake the ARN at build time,
resolve the value at runtime via the compute role, cache per warm container)
was hand-rolled twice: `apps/chat/src/lib/secrets.ts` (`getCachedSecret`, raw
string) and `apps/form_builder/app/server/secrets.ts` (JSON-parsing variant +
typed getters). Issue #1392, second of the three extractions in
`docs/plans/1391-lib-bedrock-secrets-categories.md`.

## What we did

- New buildable `packages/aws-secrets` (`@govtech-bb/aws-secrets`) exporting
  `getCachedSecretString(arn)` and `getCachedSecretJson(arn)`. TDD, 7 tests
  (SDK mocked).
- chat: `db/index.ts` → `getCachedSecretString`; deleted its `secrets.ts`.
- form_builder: `secrets.ts` slimmed to its app-specific typed getters
  (`getAdminApiToken`/`getSessionSecret`/`getGitHubOAuthCreds`) + `readStringField`,
  importing `getCachedSecretJson` from the package.
- Removed the now-orphaned direct `@aws-sdk/client-secrets-manager` dep from
  both apps.

## Why we did it that way

- **Generic primitives in the package, config-shaped getters in the app**
  (user decision). The typed getters encode form_builder-specific knowledge —
  which env var, which JSON field names, which `process.env` fallback — so they
  aren't reusable. The package stays a thin, generic cache. Considered an ADR
  for this boundary but it didn't clear the bar — it's a sensible default, not
  a surprising constraint.
- **`getCachedSecretJson` parses on top of the shared string cache** rather than
  keeping a second parsed-object cache. The expensive thing (the Secrets Manager
  network call) is still cached once per ARN; re-parsing a 2-3 field object on
  each typed-getter call is sub-microsecond. One cache, cleaner dedup, negligible
  cost.
- **No ADR-0055 subpath/.d.ts dance** (unlike LIB-03): both consumers are
  Vite/Nitro bundler apps that resolve `@govtech-bb/*` via `exports` → source,
  so a plain ESM package + a `package.json` dep is enough. form_builder's vitest
  resolved the new dep with no alias (same as it already does for
  `@govtech-bb/content`/`git-publish`).

## What we almost got wrong

The worktree came up based on a **stale** `origin/sandbox` (`f9028a55`) even
though the branch had moved three times that session; caught only because the
user said to pull + validate. Reset to the live tip (`fede2c82`) before writing
any code — otherwise the PR would have carried a noisy, conflict-prone merge.
(Recurring trap — see the `fetch-before-enterworktree` memory.)

## Open questions

None for LIB-04. LIB-05 (#1393, category taxonomy) is next; its real scope needs
re-checking against the live tree — `@govtech-bb/content` already exists and both
chat and form_builder now depend on it, so the plan's assumptions may be stale.
