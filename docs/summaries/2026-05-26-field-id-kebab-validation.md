# Field ID Override — kebab-case validation

Issue: [#201](https://github.com/govtech-bb/gov-bb/issues/201) · Plan: `docs/plans/field-id-kebab-validation.md`

## Context

The form_builder field edit panel let you type anything into the **Field ID
Override** input (`My Field`, `camelCase`, `snake_case`, `!!!`). Malformed ids
silently propagated into recipes and broke downstream field references. The Step
ID input already enforced kebab-case; the Field ID Override didn't.

## What we did

- Extracted the kebab rule into `apps/form_builder/app/routes/builder/ui/-id-validation.ts`
  (`KEBAB_ID_PATTERN` + `kebabize`), unit-tested test-first (25 cases) — commit `91bcc87`.
- Pointed `-step-editor.tsx` at the shared module, dropping its local copies — pure
  refactor, commit `bf0be80`.
- Added a live inline error + on-blur normalization to the Field ID Override input in
  `OverrideForm` (`-field-edit-panel.tsx`) — commit `3ae2324`.

## Why we did it that way

- **Extract, don't copy.** The rule already existed verbatim in `-step-editor.tsx`.
  Copying it into the field panel would leave two drifting copies of the same regex
  and normalizer. Extraction de-dupes the existing one and is a single co-located
  file both editors import.
- **Normalize-on-blur, not hard-reject.** The Step ID input hard-rejects per keystroke
  because it commits live. The field panel commits overrides only on **Save**, so a
  "block the commit" model doesn't map cleanly. Auto-normalizing on blur (blur fires
  before Save's click) keeps the value valid by commit time, and the live inline error
  explains *why* the value changed under the user. Less friction than disabling Save.
- **State lives in `OverrideForm`, not the panel.** `OverrideForm` renders once per
  top-level field and once per block child, each its own component instance — so
  per-instance `useState` covers child overrides for free, no extra wiring.
- **TDD only on the pure functions.** The module got a full test-first spec. The two
  React edits (refactor + the input handlers) are verified by the build compiling and
  by manual browser smoke — the team's standing preference for UI flows over Playwright.

## What we almost got wrong

- The plan referenced `apps/form_builder/...` while recent git churn was in `apps/forms/`
  — checked for drift first; paths were correct, no rewrite needed.
- `pnpm exec nx run-many -t build` fails on `landing:build`, which looks alarming but is
  the known network-dependent prebuild (`fetch-form-manifest` returns zero forms from the
  sandbox API) — unrelated to this change. Every compile target including
  `form-builder-app` builds clean.
- The plan's stated test command `pnpm --filter form_builder test` doesn't work; the nx
  project is `form-builder-app` (`pnpm exec nx test form-builder-app`).

## Open questions

- **Uniqueness is still out of scope.** Two fields can normalize to the same id and
  silently collide. This change only validates *format*, matching the Step ID input's
  scope. Tracked in [#206](https://github.com/govtech-bb/gov-bb/issues/206).
- `kebabize` does not split camelCase on word boundaries (`camelCase` → `camelcase`, not
  `camel-case`) — intentional, matches existing Step ID behaviour.
