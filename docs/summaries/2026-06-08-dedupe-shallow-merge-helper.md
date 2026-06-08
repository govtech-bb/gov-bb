# Dedupe `mergeValidations`/`mergeUi` shallow-merge helpers (#796)

## Context

Four byte-identical four-branch merge helpers — `mergeValidations` and
`mergeUi` — were duplicated across the two parallel override resolvers:
`apps/api/src/registry/resolution.ts` (the production/served path) and
`packages/form-builder/src/resolution.ts` (the builder preview path). That
duplication is exactly the drift surface that caused
[#789](https://github.com/govtech-bb/gov-bb/issues/789), where `ui` was
deep-merged on one path but not the other and the two views disagreed. Resolved
on `dedupe-shallow-merge-helper-796` (targets `sandbox`).

## What we did

- **Added `packages/form-types/src/merge.ts`** — a single generic
  `shallowMergeDefined<T extends object>(base, override)` whose body is
  byte-identical to the four helpers it replaces.
- **Exported it** from `form-types`' `index.ts`, with a matching re-export test
  in `index.spec.ts` (that file pins one test per export).
- **`apps/api/src/registry/resolution.ts`** and
  **`packages/form-builder/src/resolution.ts`** — deleted both local helpers,
  call `shallowMergeDefined` in `applyPrimitiveOverrides` / `applyOverrides`,
  dropped the now-unused `PrimitiveUI` / `ValidationRule` imports.
- **Unit tests** (`merge.spec.ts`) covering all four branches plus the
  by-reference-return and no-mutation contracts.

## Why we did it that way

- **The helper lives in `form-types`, not a new `merge-utils` package.** Both
  resolvers already depend on `@govtech-bb/form-types` and list it in their
  tsconfig `references`, so there was no new project-reference wiring to do —
  and `form-types` already ships runtime utilities (`dynamic`,
  `validateFormContract`), so a 6-line function is at home there. A dedicated
  package would have been overkill.
- **Inline call + pointer comment, not thin named wrappers.** Keeping
  `const mergeUi = shallowMergeDefined` locally would preserve call-site
  readability but reintroduce a per-file declaration that can drift again — the
  exact thing we're removing. Instead each call site carries a one-line comment
  pointing at #371 (validations) and #789 (ui) so a future editor doesn't
  "simplify" the deep-merge back to a wholesale spread. **Keep the knowledge,
  drop the duplication:** the general merge semantics live in the helper's doc
  comment; the hard-won bug-specific rationale stays where it's load-bearing.
- **Generic `<T extends object>` is a safe widening.** The old signatures were
  concrete (`ValidationRule | undefined`, `PrimitiveUI | undefined`); both
  satisfy `object`, and every caller spreads the result, so returning a single
  present side by reference (rather than cloning) is safe — documented in the
  helper and pinned by a test.
- **Behaviour is byte-for-byte preserved.** This is a pure refactor; the
  existing resolver test suites are the regression net and stayed green.

## Open questions

- None. The plan's only judgement call (wrappers vs. inline) was settled in
  favour of inline + pointer comment.
