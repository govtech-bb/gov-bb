# 0071 — Recipe files have one canonical serialization

**Date:** 2026-08-25
**Status:** Accepted

## Context

A recipe lives at `apps/api/src/forms/form-definitions/recipes/<formId>.json` as
a single mutable file "edited in place and reviewed by diff" — the model
[0041](0041-recipe-versions-are-immutable-and-deploy-claims-are-reserved.md)'s
supersede note describes after versioning was retired in
[0057](0057-recipe-versioning-removed-one-flat-file-per-form.md). Diff review is
therefore the only gate standing between an edit and a citizen-facing form
(see #2245).

Three parties write that file, and each had its own key order:

| Writer                                                | `validations.required` | `overrides`            |
| ----------------------------------------------------- | ---------------------- | ---------------------- |
| Hand or AI authoring (`/form-design`, the web editor) | `value, error`         | `fieldId, label, hint` |
| Zod schema declaration order (any `.parse()`)         | `error, value`         | `fieldId, label, hint` |
| The form builder's Deploy                             | `error, value`         | `label, fieldId`       |

The builder's order matched neither of the others because
`packages/form-builder/src/serialization.ts` hand-builds the recipe shape rather
than reordering an existing one. `publish.ts` then wrote whatever its in-memory
object happened to be, via a bare `JSON.stringify(recipe, null, 2)`.

Every crossing between writers rewrote the whole file. Measured by deep-key-sorting
both sides of each commit and re-diffing: across the last 60 `Publish …` commits,
3,198 of 6,756 changed lines (47%) were pure key reordering. Individual commits
reached 99% noise — `c7a4cc7f` changed 559 lines of which 3 were real. A reviewer
cannot see a weakened validation message or a dropped `required` in that.

## Decision

**A recipe file has exactly one valid byte representation, and every writer
produces it.**

1. **One serializer.** `serializeRecipe()` in `@govtech-bb/form-types` defines the
   on-disk form: canonical key order, 2-space indent, trailing newline. Every
   writer of `recipes/<formId>.json` goes through it. A new write surface is not
   free to serialize a recipe itself.

2. **Canonicalization is value-preserving.** It may reorder keys; it must never
   drop, add, or rewrite one. The result deep-equals the input.

   This is why it is **not** `serviceContractRecipeSchema.parse(recipe)`. Zod does
   emit keys in schema-declaration order — the tempting one-liner — but it also
   strips keys the schema does not enumerate. That is exactly the data loss
   `carryUnauthoredFields` exists to prevent (#2397, where Deploy silently
   deleted `catchmentRouting` three times). Canonicalization sorts an object's
   _own_ keys and appends unknown ones in their existing relative order.

3. **Key order derives from the schema, not a hand-maintained table.** The order
   is recovered by walking `serviceContractRecipeSchema`, so a new schema field
   needs no edit to the serializer. A `KEY_ORDER` map would be simpler code but
   would need entries for dozens of primitive, rule and processor shapes and
   would drift from the schema.

   A key type that _declares_ an order supplies one: `validations` is a
   `z.partialRecord` keyed by the `validationTypeSchema` enum, so its rule names
   are ordered. A record with an open key type (a block element's overrides,
   keyed by arbitrary fieldIds) has no declared order and is left alone.

4. **Array element order is authoring-significant and never changes.** Steps,
   elements and options are ordered by the author; only the keys _inside_ each
   element are touched.

5. **A subtree the walk cannot read is returned untouched** — a `z.pipe`/transform,
   a union no member validates. No reorder beats a wrong reorder. Both halves are
   pinned over the real corpus by `apps/api/.../recipe-invariants.spec.ts`:
   value-preserving, and a fixed point once applied.

## Consequences

- Any future recipe write surface — a fourth writer, a migration script, a bulk
  edit tool — must route through `serializeRecipe` or it reintroduces the drift.
- `pnpm validate-recipes` reports non-canonical files and `--write` normalizes
  them, so a hand edit can canonicalize its own recipe in the same PR.
- **The check warns rather than fails, for now.** Recipes converge lazily: each
  normalizes the first time it is next deployed or hand-edited, because
  normalizing all 92 at once would change ~21k lines and conflict with every open
  Deploy PR. Failing today would red-flag PRs that did not cause the drift. Once
  the non-canonical count reaches 0 the check should become an error — until then
  a hand edit can still reintroduce drift.
- Recipes are no longer stored in the order a human typed them. That order was
  never stable across writers, so nothing real is lost; but a diff on the first
  Deploy after this change absorbs that recipe's one-time reorder.
