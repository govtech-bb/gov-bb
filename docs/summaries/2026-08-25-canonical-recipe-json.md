# Canonical recipe JSON serialization (#2487)

## Context

Deploy PRs from the form builder were mostly unreadable. Isaiah asked whether an
issue already existed for the diff noise; none did (the closest neighbours —
#2409, #2397, #2245 — are all about recipe _content_ loss, not ordering). So the
session started by measuring the problem rather than assuming it.

Measurement method worth reusing: deep-key-sort both sides of a commit and
re-diff, so "semantic" means "changes that survive ignoring key order". On
`d6b1a1f5` that was 208 changed lines of which **4** were semantic. Across the
last 60 `Publish …` commits, 3,198 of 6,756 changed lines (47%) were pure
reordering, with individual commits reaching 99% noise.

## What we did

- `canonicalizeRecipe()` / `serializeRecipe()` in `packages/form-types/src/canonical-json.ts`
- wired into all three repo write sites (both `publish.ts` paths in
  `apps/form_builder`, plus the dormant `form_builder_api` one)
- a non-blocking canonical check plus `--write` in `scripts/validate-recipes.ts`
- corpus invariants in `apps/api/.../recipe-invariants.spec.ts`
- see [ADR 0071](../decisions/0071-recipe-files-have-one-canonical-serialization.md)

## Why we did it that way

**Three writers, not two.** The obvious story was "hand-authored order vs Zod
order". The data showed a third: the builder emitted `label, fieldId` where the
schema declares `fieldId, label`, because `packages/form-builder/src/serialization.ts`
hand-builds the recipe shape. That killed any fix that only taught one writer to
behave, and pointed at the git write boundary as the single choke point.

**Not `schema.parse()`.** A one-line canonicalizer was available and verified to
work — Zod does emit keys in schema-declaration order. It was rejected because
Zod also strips unknown keys, which would have re-opened #2397, the data loss
`carryUnauthoredFields` exists to prevent. Hence sort-own-keys-only. This is the
single most important constraint in the module and the reason it is 60 lines
instead of 1.

**Schema-derived order over a hand table.** A `KEY_ORDER` map would be simpler
code and could be ordered for readability rather than schema accident, but it
would need entries for dozens of primitive/rule/processor shapes and would drift.
Deriving from the schema is self-maintaining. Alphabetical was rejected outright:
`content` before `formId`, `createdAt` at the top of every file.

**Lazy convergence over a normalization PR.** Isaiah chose this. `--write` over
all 92 recipes changes ~21k lines with zero semantic change — verified per-file
by deep-key-sorted comparison against `HEAD`. Landing that as one commit would
have conflicted with every open Deploy PR (#2479, #2482 were open). Instead each
recipe normalizes the first time it is next deployed or hand-edited: that one PR
still absorbs its reorder diff, every Deploy after it is clean. The cost is that
the CI check must warn rather than fail until the count reaches zero.

**Why the check compares raw bytes.** It covers indent and trailing newline as
well as key order, which makes `--write` a real formatter rather than a
key-sorter. Confirmed with Isaiah before building.

## What we almost got wrong

**Two Zod assumptions in the plan were wrong**, and both were caught by probing
the library rather than trusting the plan:

1. The plan said `serviceContractRecipeSchema` is a `superRefine` wrapper needing
   unwrapping. In Zod 4 `.superRefine()` returns the same `ZodObject` with a
   check appended, so `def.shape` reads straight through.
2. The plan assumed discriminated unions. The `elements` union has
   `discriminator: undefined` — both members are shaped `{ ref, overrides }`,
   distinguished only by the `components/` vs `blocks/` ref prefix. Member
   selection is by `safeParse` instead, which also covers the genuinely
   discriminated processors union through one code path.

**The `validations` record nearly shipped unordered.** The first implementation
took `d6b1a1f5` from 208 lines to 12, not 4. The residual was `validations`
being a `z.record`, which the walker skipped on the reasonable-sounding grounds
that record keys are arbitrary. They are not: it is a `z.partialRecord` keyed by
the `validationTypeSchema` **enum**, so its rule names have a declared order.
Block overrides (`z.record(string, …)`, keyed by fieldId) genuinely are arbitrary
and are still left alone. The distinction is now "does the key type declare an
order", which is the right question.

**A test asserted the wrong behaviour.** A test expected an unknown validation
rule name to sort after the known ones. It fails `safeParse`, so no union member
matches and the element keeps its order — the intended safe fallback. The test
was rewritten to pin that guarantee rather than the code bent to match the test.

**The corpus test had to move.** It first lived in `form-types`, whose tsconfig
carries only `vitest/globals` — reading the filesystem broke `form-types:build`
(that package's build type-checks its specs). It moved to `apps/api`'s
`recipe-invariants.spec.ts`, alongside the other corpus-wide invariants, which is
a better home anyway. Note `scripts/*.spec.ts` was considered and rejected:
root `scripts/` is not an nx project, so CI's `nx affected -t test` never runs
those specs.

**Review found a dormant asymmetry.** The array branch resolved its element
schema directly, so it ran _before_ union resolution — meaning an array-typed
union member would never be reached and its elements would silently keep their
key order. Dormant today (the one such union, `processor.type.ts:136`, holds
strings, where reordering is a no-op) but a future schema addition would have
reintroduced drift with nothing to catch it: an untouched subtree is still a
fixed point, so the corpus test stays green. Fixed by resolving unions before
splitting array from object, which also made `isPlainObject` redundant.

**That fix then broke the build without breaking a test.** Dropping
`isPlainObject` lost TS's narrowing to `Record<string, unknown>`. `nx test`
stayed green because Vitest does not type-check; `tsc -b` and `nx build` caught
it. Worth remembering: for this package the test run is not a type gate.

**No regression test for `__proto__` existed.** Recipes are authored JSON, so a
`__proto__` key is reachable input. It is safe — `JSON.parse` makes it an own
data property and `Object.fromEntries` keeps it one — but nothing pinned that,
and a future rewrite of `orderKeys` to sequential `obj[key] = …` assignment would
have turned it into a real prototype write. Now tested.

## Open questions

- **A real sandbox Deploy has not been done.** Everything is verified against
  real recipe files and against the exact bytes PUT to GitHub (mocked), but not
  through a live builder Deploy. Worth doing once after merge: deploy the same
  form twice with no edits and confirm the second diff is `updatedAt` only.
- **The check should become blocking** once the non-canonical count reaches 0,
  or hand edits will keep reintroducing drift. Needs a follow-up issue.
- **`scripts/*.spec.ts` is never run in CI** (no nx project). Pre-existing, found
  incidentally, not fixed here.
- **`-preview-modal.tsx:33`** stringifies a recipe for the debug download link.
  Not a repo write, deliberately left alone.
