# Form builder — added-field row shows label as primary text — Implementation Session

**Date:** 2026-05-26
**Branch:** `feat/form-builder-field-row-label`
**Issue:** [#202](https://github.com/govtech-bb/gov-bb/issues/202) — form_builder: added-field row should show the field label, not the component name
**Plan:** `docs/plans/form-builder-field-row-label.md`

## Context

In the step editor, each added-field row showed the component/display name (e.g. *Text*) as the primary text with the `kind` as a badge. A step full of same-typed fields was therefore unscannable — every row read "Text". #202 asks to promote the field's **label** (the question the end-user sees) to primary text and demote the display name to muted secondary text, mirroring the Add Field picker which already pairs a primary label with a secondary badge.

## What we did

**One worktree, one implementation subagent, strict TDD.** The testable core is a pure label-resolution function, so it was written test-first; the surrounding JSX/CSS is a layout tweak.

- New pure helper `resolveFieldLabel(field, item)` in a sibling module `-field-label.ts` (resolving the plan's one open question — sibling over inline export, for a clean `.spec.ts` import). Fallback chain: `field.overrides?.label` → component/custom `item.primitive` label → `item.displayName` → `field.ref`.
  - The primitive label is optional-chained: custom components surface a component-shaped object whose `primitive` is `definition as unknown as Primitive` and can lack a `label` at runtime, so the helper must guard and fall through to `displayName`. Blocks have no `primitive` at all (discriminated via `"primitive" in item`).
  - Empty-string overrides are treated as not-set (truthiness), so they fall through rather than rendering a blank primary.
- `-field-label.spec.ts` — 8 cases: override wins, component primitive label, block→displayName, custom-with-absent-label→displayName, undefined item→ref, empty-string override fallthrough (two paths), everything-absent→ref. Runs in form_builder's node-env Jest (`testRegex: .*\.spec\.ts$`), same as `-recipe-reducer.spec.ts` — no jsdom, so no component-render test was added.
- `-step-editor.tsx` row rewritten: primary = resolved label (override dot stays inline before it); muted secondary = `displayName`, rendered only when `displayName !== label` (so an un-edited registry component, whose resolved label *is* its displayName, shows a single line instead of the same string twice). `kind` badge and ▲ ▼ / Edit / × buttons untouched.
- `builder.module.css`: added `.fieldRowSecondary` (0.75rem, `--color-text-muted`).

## Verify

- `pnpm jest --no-coverage` in `apps/form_builder`: 91 pass (was 83 baseline; +8 from the new spec). All pre-existing suites green.
- `pnpm exec nx run-many -t build --exclude landing`: all 12 projects compile, including `form-builder-app` and the `form-builder` package.
- `pnpm exec nx run-many -t test`: 60 suites pass (1 skipped), 561 tests.
- Browser smoke test by the user (per standing preference for real-browser smoke tests over automated drivers).

## Pre-existing failures (not introduced here)

- `landing:build` fails on its `fetch-form-manifest` prebuild, which hits a live external forms API that returned zero forms — environmental, unrelated. Hence the `--exclude landing` on the build verify.
- `form-builder-app:lint` is red on `dev` already: `css/no-invalid-properties` fires on every `var(--color-*)` in `builder.module.css` (theme vars live in another file the rule can't resolve), plus `no-explicit-any` in untouched server files. The three touched/new files in this change are individually lint-clean. Lint is not a CI gate here (CI runs build + test).

## Base branch

Branched fresh from `origin/dev` (the files touched were identical between `dev` and `sandbox`, giving a clean diff). Per the user's wrap-up instruction, the PR targets **`sandbox`** as its base, which later flows into `dev` via its own PR.
