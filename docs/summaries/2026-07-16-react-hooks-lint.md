# Session summary — Enable eslint-plugin-react-hooks (#1976)

**Date:** 2026-07-16 · **Branch:** `dx-1976-react-hooks-lint` (off `main`)

## What shipped

`eslint-plugin-react-hooks@7.1.1` wired into every React ESLint config with the
two classic rules: `rules-of-hooks` = **error**, `exhaustive-deps` = **warn**.
Plus a fix for the `useStore`-in-a-loop bug in the forms `$formId` route.

- Root `eslint.config.mts` (covers form_builder, feature_flagging, analytics),
  `apps/forms/eslint.config.ts`, and `apps/landing/eslint.config.js` each gained
  a react-hooks block.
- `apps/forms/src/routes/forms/$formId/index.tsx` — replaced a `useStore`-in-a-
  `for`-loop (plus a memo whose fresh-array dep defeated it) with a stable
  primitive key derived from the already-subscribed `formValues`.
- Root config also now ignores `**/.amplify-hosting/**` (local-lint hygiene).

## Why it looks the way it does

- **Three configs, not one.** The plan assumed a single shared root config with
  forms "unlinted". Reality: `apps/forms` and `apps/landing` each have their OWN
  full ESLint config and are already linted and green — the root only ignores
  forms to avoid double-linting. So react-hooks had to be added in three places,
  and the planned "lint forms hooks-only to dodge its lint debt" was moot (there
  is no hidden debt). This corrected a wrong premise from the original audit.

- **Only two rules, not the `recommended` preset.** react-hooks@7 bundles the
  React-Compiler rules (immutability, purity, set-state-in-render, …) into its
  `recommended`/`recommended-latest` configs — ~17 rules, far beyond what #1976
  asks. We enabled exactly `rules-of-hooks` + `exhaustive-deps` by name.

- **`exhaustive-deps` is warn.** Surfaces missing-dep issues without blocking
  merges; there's no `--max-warnings=0` in CI, so warnings never fail the gate.

- **form-renderer split out to #1981.** Turning on `rules-of-hooks=error`
  surfaced 6 real violations, all in `apps/forms/src/components/form-renderer.tsx`
  — hooks called after an early `return null` (line 211). Fixing that is a risky
  refactor of the core renderer (hoist every hook above the return), out of scope
  for "enable a lint rule". Decision (with the owner): add a **targeted
  `rules-of-hooks: warn` override for that one file** so the rule stays `error`
  everywhere else, and track the real fix in #1981. New code is guarded
  immediately; the legacy cluster is isolated, not ignored.

- **chat stays uncovered.** `apps/chat` has no lint target at all, so react-hooks
  can't run there yet — flagged, tracked with the broader lint-target gap
  (#1885), not addressed here.

## Verification

CI-equivalent gate (`nx run-many -t lint --exclude=api,form-builder-app`): 0
errors across 15 projects (warnings only). A negative control (a hook after an
early return in a non-exempt forms file) correctly errored. `forms:test` passed.

## Follow-ups

- **#1981** — fix form-renderer's hook ordering and remove the per-file override.
- Extend react-hooks to `apps/chat` once it has a lint target (#1885).
