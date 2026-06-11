# Recipe "explicit `required`" guard for generic primitives (#429)

## Context

[#429](https://github.com/govtech-bb/gov-bb/issues/429) flags that all 10
`components/generic-*` primitives ship `validations.required = { value: true,
error: "This field is required" }`. Because recipe overrides merge per-key
(ADR 0037), an override that omits `validations.required` silently inherits
`required: true` and renders the generic error on an empty, optional-looking
field. A few hundred generic field instances across the corpus are implicitly
required this way, many unintentionally. Built on `feat/recipe-required-guard`
in a worktree (targets `sandbox`).

## What we did

- `scripts/recipe-required-guard.ts` — a pure, unit-tested decision function
  `findRequiredGuardViolations({ recipeFiles, hasOverrideLabel })` plus a thin
  CI driver (`main()`, gated on `require.main === module`). Mirrors the existing
  `recipe-version-guard.ts` shape. The rule: index base + head step elements by
  `(stepId, fieldId)`; a `components/generic-*` element is in scope only if it
  was **added** (absent from base) or **modified** (serialized override differs);
  each in-scope element must declare `overrides.validations.required.value` as a
  boolean, else it's a violation. Unchanged elements are grandfathered. A
  newly-added file (`baseJson: null`) puts every generic field in scope.
- The driver reads `GITHUB_EVENT_PATH`/`GITHUB_TOKEN`/`GITHUB_REPOSITORY`,
  fetches the PR (labels read **live**, plus base/head SHAs), short-circuits on
  the `recipe-required-override` label, lists changed files (paginated), filters
  to the recipe path pattern excluding `removed`/`unchanged`, fetches each file's
  content at both SHAs via the contents API, calls the pure function, and exits
  non-zero on any violation.
- `scripts/recipe-required-guard.spec.ts` — 12 tests (pure function only, no
  network) covering added/modified/unchanged, explicit `true`/`false`,
  non-generic refs, the shallow-merge trap (other validations but no `required`),
  null base, all 10 generic refs, label skip, and multi-file aggregation.
- `package.json` — added `"recipe-required-guard": "tsx
  scripts/recipe-required-guard.ts"` (sibling to `recipe-version-guard`).
- `.github/workflows/ci.yml` — a `pull_request`-only "Recipe Required Guard"
  job cloned from the version-guard job (`contents:read` + `pull-requests:read`).
- Recorded the principle in ADR 0049.

## Why we did it that way

- **Guard, not a default flip.** The tempting fix — flip the base primitive to
  `required: false` — was rejected. Registry primitive defaults are global and
  unversioned, so flipping changes the served behaviour of *every* recipe
  version at once (silently making genuinely-required fields optional), and
  re-asserting `required: true` would force a new version file per recipe because
  versions are immutable (ADR 0041). The guard leaves all served behaviour
  untouched and only constrains new authoring. (ADR 0049.)
- **Per-changed-field, not per-touched-file.** File-level granularity (like
  recipe-version-guard) was simpler but would penalise an author editing one
  field's label by demanding explicit `required` on every grandfathered generic
  field in that file. Identity is `(stepId, fieldId)`, compared by serialized
  override content between base and head — order-independent and robust to step
  reordering.
- **"Go with second option" → both sub-choices' second option.** The user's
  steer was read as per-changed-field granularity **and** an override-label
  escape hatch. The label (`recipe-required-override`) and live label reads
  mirror the repo's existing `recipe-version-override` convention so the escape
  hatch is consistent and a re-run picks it up without a new commit.
- **`parseRecipe` re-throws the original error rather than wrapping it.** The
  idiomatic `new Error(msg, { cause })` failed two ways here: the lint rule
  `preserve-caught-error` wants the cause preserved, but the scripts' ts-jest
  compile context resolves the repo-root `tsconfig.json` (which declares no
  `lib`), so neither the two-arg `Error` constructor nor `Error.cause` type-checks.
  Re-throwing the caught error with the file path prepended to its message
  satisfies both — it preserves the original (and its stack) without needing
  ES2022 lib.

## Follow-up

- Guard spec (12 tests) green; full `nx run-many -t build --exclude=landing,cms`
  green; eslint + prettier clean on the new files. The `scripts/` spec is **not**
  run by CI's `nx affected -t test` (scripts isn't an nx project) — same as the
  sibling recipe-version-guard.spec; run it explicitly via
  `pnpm exec jest -c scripts/jest.config.ts`.
- Known, separately-trackable cleanup (not done here, by design): the existing
  implicitly-required generic fields across the corpus.
- Out of scope as future follow-ups: `blocks/*`-nested generics, non-generic
  primitives that also default to required (`name`, `email`, `address`, …), and
  any runtime resolution / registry-default change.
