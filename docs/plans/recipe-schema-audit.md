# Recipe ↔ Upstream Schema Audit (issue #404)

## Goal

Bring every form recipe in `apps/api/src/forms/form-definitions/recipes` back
in line with its canonical upstream schema in
`frontend-alpha/src/schema`. For each recipe that has an upstream counterpart,
every divergence is either **fixed** in the recipe or **documented as
intentional** (e.g. a platform limitation already noted in
`FORM-MIGRATION-NOTES.md`).

The confirmed reference bug — `get-birth-certificate` Address Line 2 silently
inheriting `required: true` from `components/address` — ships first as a small
standalone PR.

## Approach

**One PR** covering the whole audit. Diff each in-scope recipe against its
upstream schema field-by-field. Record findings in one audit doc
(`docs/audits/recipe-schema-divergence.md`) and apply all fixes in the same PR.
The `get-birth-certificate` Address Line 2 + `mother-other-names` fixes (already
made) are folded into this PR. Issue #404 closes when this PR merges.

**Alternatives considered:**

- *Phased PRs (reference fix first, audit second)* — rejected by request; the
  team wants a single PR to review and close the issue with.
- *Per-form sub-issues / per-form PRs* — rejected. The audit doc gives per-form
  granularity without extra tracking overhead.

## Scope

### In scope (recipe ↔ upstream pairs)

Confirmed matches by slug:

1. `apply-for-conductor-licence`
2. `exit-survey`
3. `get-birth-certificate` *(Phase 1)*
4. `jobstart-plus-programme`
5. `primary-school-textbook-grant`
6. `project-protege-mentor`
7. `reserve-society-name`
8. `sell-goods-services-beach-park`

Slug-mismatched pairs (confirmed same form by matching step titles):

9. `request-a-fire-service-inspection.ts` ↔ recipe `request-fire-inspection/`
10. `sports-training-programme-form-schema.ts` ↔ recipe `community-sports-training/`

### Out of scope

- Upstream-only schemas with **no recipe** (e.g. `get-death-certificate`,
  `get-marriage-certificate`, the three `post-office-redirection-*`) — there
  is nothing to audit against.
- Recipes with **no upstream** (everything in the ~50 recipe folders not listed
  above, e.g. `passport-renewal`, `national-id-application`, the
  `youth-opportunity-*` family) — issue #404 is explicitly about recipes that
  drifted from an upstream, not recipes that never had one.
- Platform-limitation gaps already enumerated in `FORM-MIGRATION-NOTES.md`
  (`showHide`, `conditionalTitle`, `mask`, `bodyContent`, `rows`,
  `numberConfig`, `enableFeedback`, untested repeatable/conditional behaviours).
  These are documented as **intentional** in the audit doc with a pointer to
  the migration notes; not fixed here.

### Phase 1 work

- Add `validations.required = false` (and clear inherited `minLength`) to the
  Address Line 2 field in
  `apps/api/src/forms/form-definitions/recipes/get-birth-certificate/1.1.0.json`
  and `.../1.0.0.json`.
- Verify no other field in `get-birth-certificate` has the same inheritance
  trap. If found, fix in the same PR (they're the same bug class).
- Run `pnpm exec nx run-many -t build` and `... -t test`.

### Phase 2 work

For each in-scope form:

1. Read upstream schema and recipe side-by-side.
2. For every field, compare:
   - Validation rules: `required`, `minLength`/`maxLength`, regex/format,
     custom error messages.
   - Field-level logic: hints, default values, conditional visibility.
   - Step structure: conditional steps / branching that exist upstream.
3. Watch for the **inheritance trap**: any `ref: "components/<base>"` whose
   upstream counterpart is optional but the base defaults to required.
4. Record one row per divergence in the audit doc with status:
   - ✅ **fixed** — change applied in this PR (link to file)
   - 📝 **intentional** — reason + link to migration notes if applicable
   - ❓ **needs decision** — flag for human review before merging
5. Apply all ✅ fixes in the same PR as the audit doc.

## Files

### Phase 1

- `gov-bb/apps/api/src/forms/form-definitions/recipes/get-birth-certificate/1.1.0.json` — edit
- `gov-bb/apps/api/src/forms/form-definitions/recipes/get-birth-certificate/1.0.0.json` — edit

### Phase 2

- `gov-bb/docs/audits/recipe-schema-divergence.md` — new, the audit doc
- `gov-bb/apps/api/src/forms/form-definitions/recipes/<form>/<version>.json` — edits per form, list firmed up during the audit

## Verify

**Phase 1:**

- Inspect the resolved recipe (after `components/address` defaults are merged)
  and confirm Address Line 2 ends up with `required: false`. Method TBD —
  either a unit test that resolves a recipe, or render the form locally and
  submit without Address Line 2.
- `pnpm exec nx run-many -t build` and `... -t test` both green.

**Phase 2:**

- Audit doc covers every in-scope form, every field, with explicit status.
- All ✅ rows correspond to a real diff in the PR.
- Build + tests green.
- Spot-check 2–3 of the fixed forms by rendering or by resolving the recipe.

## Open questions

- **Slug-mismatch confirmation (forms 9 and 10):** are
  `request-fire-inspection` and `community-sports-training` actually the
  recipe equivalents of their similarly-named upstream schemas, or different
  forms? To check in Phase 2 before diffing.
- **How to test "what the recipe resolves to" cheaply** — is there an existing
  resolver/test harness in `gov-bb` that merges a recipe against its base
  components, so we can assert the final shape? If not, may need a small test
  helper. Investigate at the start of Phase 1.
- **What to do with ❓ rows** at PR time — block the PR until resolved, or
  merge audit doc with ❓ rows and follow up? Default: resolve all ❓ before
  merging Phase 2, so the doc ships in a clean state.
