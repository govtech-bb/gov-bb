---
name: form-design
description: Use when creating a new form, editing an existing form, adding/removing/changing fields, steps, validations or behaviours on a form, or publishing a new version of a form recipe on the Government of Barbados forms platform.
---

# Form Design

Create and edit Government of Barbados form recipes (service contract JSON) the same way the Form Builder AI does — guardrails first, then the repo's file conventions.

## Step 1 — Read the guardrails BEFORE designing anything

**REQUIRED:** Read `apps/form_builder_api/src/ai/system-prompt.ts` before proposing or writing any field. It is the single live source of truth for component selection, validation defaults, blocks, layout, and the critical rules (kebab-case ids, unique fieldIds, email processor, etc.). ALL of it applies here.

If that file is missing or moved, STOP and tell the user — never proceed from memory.

Do not skip the read because the change "is just one field." The most common unaided mistake is a guardrail violation on a small edit — e.g. a radio with 3 options (Rule 8: radio is for exactly 2 options; 3+ means select).

Three adaptations to the system prompt's rules in this context:

| System prompt says                                  | In this skill                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Output recipe in a ```json chat block / SQL wrapper | Write a `.json` recipe file in the repo; the SQL section does not apply                                                             |
| Single-shot, never ask questions                    | Conversational — ask the designer when genuinely ambiguous; still apply guardrails deterministically where they answer the question |
| Create-only (PDF → recipe)                          | Editing existing forms is in scope (edit the recipe file in place)                                                                  |

## Step 2 — File layout

Recipes are flat files, one per form: `apps/api/src/forms/form-definitions/recipes/<formId>.json`.

- **New form:** create `recipes/<form-id>.json`.
- **Edit:** change the file in place and update `updatedAt`; preserve `createdAt`.

There is no `version` field and no version bumping. Versioned recipe directories were retired — if you find guidance elsewhere describing `recipes/<formId>/<version>.json` or minor-version bumps, it predates that change and does not apply.

Invariants (enforced at API boot — a violation aborts deploys):

- `formId` inside the JSON must equal the filename minus `.json`.
- `stepId`s must be unique within a recipe, and authored `fieldId`s unique within a step.
- Every component `ref` must resolve.

Optional fields: set `"required": {"value": false}` explicitly. Omitting the rule does NOT make a field optional — generic primitives (and many named components, e.g. `components/address`) inherit `required: true` from the registry, so omission silently ships a mandatory field. The renderer derives a muted "(optional)" label suffix from `value: false`; never write "(optional)" into `label` or `hint` text — it would render doubled.

## Step 3 — Verify

After writing or editing any recipe:

```bash
pnpm validate-recipes
```

This schema-validates every recipe file and checks the invariants above. It is the fastest gate and the one to reach for first — nothing else in the repo catches invalid recipe JSON, since Prettier, lint, build and type check all pass on a malformed recipe.

For the full spec suite behind it:

```bash
pnpm exec nx run api:test
```

Filtering that to a single spec trips the repo's global coverage thresholds, so if you want just the invariants, disable coverage for the run:

```bash
pnpm exec vitest run recipe-invariants --coverage.enabled=false
```

Fix failures before presenting the work as done.

## Common mistakes

| Mistake                                                                    | Fix                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Adding a `version` field, or a `recipes/<formId>/` directory               | Recipes are flat `recipes/<formId>.json` files, edited in place                                       |
| Renaming a recipe file without changing `formId` (or vice versa)           | The filename minus `.json` and the `formId` must match, or the API aborts at boot                     |
| Radio with 3+ options                                                      | Select for 3+; radio only for exactly 2 (Rule 8)                                                      |
| Repurposing a semantic component (e.g. `date-of-birth` for an expiry date) | Use the generic primitive with fieldId + label override (CATEGORY 0)                                  |
| `fieldConditionalOn`/`optionalIf` value set to a display label             | Values are always lowercased + kebab-cased option values (`"christ-church"`, never `"Christ Church"`) |
| Rediscovering conventions from loader source code                          | Everything you need is in the system prompt + this skill                                              |
