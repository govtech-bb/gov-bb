# Form Builder — retire the vestigial builtin catalog (#515)

## Context

`@govtech-bb/form-builder`'s `BUILTIN_COMPONENTS` / `BUILTIN_BLOCKS` carried refs
(`components/text`, `blocks/name`, …) that exist in **no** runtime registry. The
production forms API resolves every published field ref against the registry
(`REGISTRY_COMPONENTS` + `REGISTRY_BLOCKS`), where only `components/generic-text`
et al. exist. But `getCatalog()` folded the builtin set into the catalog, and
`getRegistryItem` checked `catalog.components` **first** — so a recipe authored
against a builtin ref resolved fine in the builder and preview, then died with an
`UnresolvableComponentError` when the published form was served. Follow-up to
#504; the builtin set had no consumers except `getCatalog()` itself.

## What we did

- Deleted `packages/form-builder/src/builtins/` entirely (11 component files, 3
  block files, `index.ts`).
- `catalog.ts` — `getCatalog()` now returns `{ components: [], blocks: [],
  custom: [] }`. Ref resolution flows through `getRegistryItem`'s registry
  fallback (tier 3); the now-empty tier-1 `catalog.components`/`blocks` check is
  left in place (harmless, per the plan's "Option 1, minimal flavor").
- `index.ts` — dropped the `BUILTIN_COMPONENTS` / `BUILTIN_BLOCKS` re-export.
  `ComponentDefinition` / `BlockDefinition` still export via `definition-types`.
- Re-pointed every builtin ref in the test suite to its registry equivalent
  (`components/text` → `components/generic-text`, `blocks/name` →
  `blocks/personal-information`, etc.), and added a regression test in
  `resolution.spec.ts` asserting builtin refs now resolve **nowhere**.

## Why we did it that way

**Option 1 (remove outright), not Option 2 (realign refs).** Realigning the
builtin refs to `components/generic-*` would keep a second copy of every generic
primitive inside form-builder that can re-diverge from the registry in shape
(htmlType, label, validations) — strictly worse than deleting it. We took the
minimal-flavor delete: leave the `RegistryCatalog` type and the dead tier-1 check
untouched (they operate on empty arrays now), rather than the full type/route
reshape, which was out of scope for this minor cleanup.

**The scope was wider than the plan's file list.** The plan named four spec files
to sweep. Running the suites surfaced three more that actually *resolved* builtin
refs and broke once the catalog emptied: `duplicate-ids.spec.ts` (form-builder),
and `registry.validate.spec.ts` + `ai.convert.spec.ts` (form-builder-api). The
distinction that matters: most spec files carry builtin ref *strings* opaquely
(round-tripped through serialization, keyed off the `blocks/`/`components/`
prefix, or paired with an explicit mock catalog item) and were unaffected; only
tests that call `getCatalog()` and assert on the resolved output needed changes.

**`blocks/name` has no two-child registry equivalent**, so block-expansion tests
moved to `blocks/personal-information` (8 children: title, first-name,
middle-name, last-name, date-of-birth, sex, nationality, national-id-number) and
their length/fieldId/sorted-collision assertions were rewritten to match. This is
the plan's accepted "the change of expectation is itself the bug fix."

**Two assumptions were caught wrong by the tests during the loop**, worth
recording so they aren't re-broken:
- *Override merge is rule-level replace, not deep-merge.* An override
  `validations: { required: { error: "X" } }` over a base-required primitive
  yields `{ error: "X" }` — the base `value: true` is dropped, not merged. The
  merge spreads at the rule-name level only.
- *The optional-field panel tests needed a genuinely optional registry
  component.* `generic-text` is base-**required**, so the "leaves an optional
  field unchecked" / "writes required:{value:true}" cases moved to
  `components/middle-name` (has `minLength`/`pattern` but no `required` rule).

**Cosmetic refresh of unchanged specs.** After the functional change was green, we
also swapped the now-stale builtin ref *literals* in ~6 untouched spec files
(serialization, field-label, recipe-reducer, apply-recipe, form-step, one
field-edit-panel block case) and a comment in `types.ts` — purely for
consistency. These tests never resolved the refs, so the swaps are no-op on
behaviour; both the input and any echo-assertion changed together to preserve
round-trip equality.

## Verification

- Build: all 13 projects compile (`landing` excluded locally for offline).
- Tests green: form-builder (121), form-builder-api, form-builder-app (369),
  form-types (279), api (647).
- `form-builder-app:lint` has 11 **pre-existing** errors in untouched auth/server
  files (unused vars, a useless assignment) — not introduced here; the changed
  files lint clean.

## Open questions

- None. The registry was already the runtime source of truth; this only removed
  the parallel catalog that let the builder disagree with it. No new convention
  established, so no ADR.
