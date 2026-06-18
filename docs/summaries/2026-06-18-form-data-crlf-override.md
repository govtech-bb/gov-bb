# Patch form-data CRLF injection (#1368)

/ 2026-06-18 · root `pnpm-workspace.yaml`

## What this was

Security-audit issue #1368: `apps/api → axios → form-data` pulled in
`form-data@4.0.5`, which has a HIGH-severity CRLF-injection flaw
(GHSA-hmw2-7cc7-3qxx) in multipart field names / filenames. Fix: force
`form-data >= 4.0.6`.

## What changed

One line in the existing `overrides:` block of `pnpm-workspace.yaml`:

```yaml
"form-data@>=4.0.0 <4.0.6": ">=4.0.6"
```

`pnpm install` then re-resolved the tree to `form-data@4.0.6` (single version)
and updated `pnpm-lock.yaml`. No application code touched.

## Why it looks this way (the non-obvious part)

The issue's suggested fix — `"pnpm": { "overrides": { "form-data": ">=4.0.6" } }`
in `package.json` — does **not** work in this repo, for two reasons discovered
during implementation:

1. **`main` and `sandbox` use different package managers.** `main` is still an
   npm repo (`packageManager: npm@10.9.0`, `package-lock.json`); `sandbox` is
   pnpm (`packageManager: pnpm@11.6.0`, `pnpm-lock.yaml`). The issue, its audit
   comments, and `CLAUDE.md` all describe the pnpm/sandbox world, so the fix
   belongs on `sandbox`. A branch off `main` can't even `pnpm install`
   ("project is configured to use npm").
2. **pnpm 11 no longer reads `pnpm.overrides` from `package.json`** — it prints
   a warning and ignores it. Overrides now live in `pnpm-workspace.yaml`, where
   the repo already keeps a block of security overrides (with a comment noting
   the same migration). The new entry just extends that block, keyed by the
   advisory's vulnerable range to match the existing style.

## Verification

- `pnpm why form-data` → only `form-data@4.0.6`.
- `pnpm audit --prod` → `form-data` / GHSA-hmw2-7cc7-3qxx no longer listed
  (6 unrelated advisories remain, out of scope).
- `nx run-many -t build --exclude=landing` → 13 projects pass.
- `nx run api:test` → 853/854 pass. The single failure is a DB-gated migration
  smoke test (`add-form-definition-unique-constraint.smoke.spec.ts`, runs only
  when `DB_HOST` is set) hitting local Postgres state — unrelated to a version
  bump; skipped/green in CI's fresh DB.
