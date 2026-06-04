---
name: form-design
description: Use when creating a new form, editing an existing form, adding/removing/changing fields, steps, validations or behaviours on a form, or publishing a new version of a form recipe on the Government of Barbados forms platform.
---

# Form Design

Create and edit Government of Barbados form recipes (service contract JSON) the same way the Form Builder AI does — guardrails first, then the repo's versioned-file conventions.

## Step 1 — Read the guardrails BEFORE designing anything

**REQUIRED:** Read `apps/form_builder_api/src/ai/system-prompt.ts` before proposing or writing any field. It is the single live source of truth for component selection, validation defaults, blocks, layout, and the critical rules (kebab-case ids, unique fieldIds, email processor, etc.). ALL of it applies here.

If that file is missing or moved, STOP and tell the user — never proceed from memory.

Do not skip the read because the change "is just one field." The most common unaided mistake is a guardrail violation on a small edit — e.g. a radio with 3 options (Rule 8: radio is for exactly 2 options; 3+ means select).

Three adaptations to the system prompt's rules in this context:

| System prompt says | In this skill |
|---|---|
| Output recipe in a ```json chat block / SQL wrapper | Write a `.json` recipe file in the repo; the SQL section does not apply |
| Single-shot, never ask questions | Conversational — ask the designer when genuinely ambiguous; still apply guardrails deterministically where they answer the question |
| Create-only (PDF → recipe) | Editing existing forms is in scope (see versioning below) |

## Step 2 — File layout and versioning

Recipes live at `apps/api/src/forms/form-definitions/recipes/<formId>/<version>.json`.

- **New form:** create `recipes/<form-id>/1.0.0.json` with `"version": "1.0.0"`.
- **Edit:** NEVER modify an existing version file. Copy the latest version to a new file and **bump the MINOR version only** — `1.1.0` → `1.2.0`, `1.1.3` → `1.2.0`. Not the patch, not the major — unless the designer explicitly asks for a different bump.
- Update `version` and `updatedAt` in the copy; preserve `createdAt`.

Invariants (enforced at API boot — a violation aborts deploys):
- `formId` inside the JSON must equal the directory name.
- The filename (minus `.json`) must equal the `version` field.

Optional fields: simply omit the `required` validation. Do not write `"required": {"value": false}`.

## Step 3 — Verify

After writing or editing any recipe:

```bash
cd apps/api && npx jest recipe-invariants
```

This schema-validates every recipe and checks the directory/filename invariants. Fix failures before presenting the work as done.

## Common mistakes

| Mistake | Fix |
|---|---|
| Editing `1.2.0.json` in place | Copy to `1.3.0.json`, bump `version` field to match |
| Bumping patch (`1.2.0` → `1.2.1`) or major | Minor only, unless the designer says otherwise |
| Radio with 3+ options | Select for 3+; radio only for exactly 2 (Rule 8) |
| Repurposing a semantic component (e.g. `date-of-birth` for an expiry date) | Use the generic primitive with fieldId + label override (CATEGORY 0) |
| `fieldConditionalOn`/`optionalIf` value set to a display label | Values are always lowercased + kebab-cased option values (`"christ-church"`, never `"Christ Church"`) |
| Rediscovering conventions from loader source code | Everything you need is in the system prompt + this skill |
