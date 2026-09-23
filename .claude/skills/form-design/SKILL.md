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

Required fields: give every required field a `required.error` that names it — the house pattern is `"{Label} is required"`, e.g. `"required": {"value": true, "error": "Date of endorsement is required"}`. Every `components/generic-*` primitive except `generic-tel` ships the generic `"This field is required"` as its base message, so omitting `error` silently ships an error that names no field. That message is also the error-summary link text, so it must read correctly standing alone.

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

## Step 4 — Create or update the form's smoke test

**REQUIRED when you change what a form submits:** if your edit adds, removes or renames a step, a field, an option or a conditional, the form must leave with a smoke spec that agrees with the new recipe. Smoke specs live at `apps/forms/e2e/smoke/<formId>.smoke.spec.ts` and walk the real form step by step with the shared helpers in `apps/forms/e2e/helpers/smoke.ts` (`openSmokeForm`, `expectStep`, `fillField`, `fillDate`, `selectRadio`, `selectDropdown`, `tickCheckbox`, `advance`, `submitAndConfirm`, …).

- **A spec exists:** update it. Add, remove or rename the steps, fields, options, conditional branches and test data your edit changed, and update the spec's header comment that describes the form. Update it also for a copy-only edit, if the spec asserts the text that you changed.
- **No spec, and you changed the shape of the form:** create one. Copy the structure of a spec for a form of a similar shape (for example `term-leave-application.smoke.spec.ts`). Cover each step to the confirmation screen.
- **No spec, and you changed only copy:** a new spec is not necessary. Tell the designer that the form has no spec.

Take field ids from the recipe's **effective** fieldIds, not just `overrides.fieldId`. A field can also get its id from a registry component default (`components/first-name` → `first-name`) or from block expansion (`blocks/personal-information`).

This step is mandatory. No other check finds a stale spec:

- Smoke specs have no type check and no lint.
- A recipe-only change makes only `api` nx-affected, never `forms`.
- After a deploy, CI smokes four specs from a hand-written list in `deploy-sandbox.yml`. Each PR preview smokes only `jobstart-plus-programme`.

Thus CI runs four specs; the rest never run in CI. A stale spec fails much later than the edit that broke it, or it never fails.

Verify the spec in two steps.

**Parse check.** This command finds the spec. It opens no browser and submits nothing:

```bash
cd apps/forms && SMOKE_BASE_URL=http://localhost:3000 pnpm exec playwright test --config playwright.smoke.config.ts --list <formId>
```

`--list` does not start the dev server, so the URL is necessary but unused. A spec that fills a field you removed passes this check. Thus the parse check is not sufficient.

**Local walk.** Start the API on the host (`pnpm dev:api`). Then walk the real form (Playwright starts the forms app for you):

```bash
cd apps/forms && SMOKE_BASE_URL=http://localhost:3000 pnpm exec playwright test --config playwright.smoke.config.ts <formId>
```

This is the only check that shows that the spec agrees with the recipe. Do this before you present the work as done. The walk submits to your local API, so its processors run unless you also set `SMOKE_SUBMISSION_TOKEN` to the value in `apps/api/.env`.

**Deployed environments.** A smoke run against a deployed environment submits a real application. `SMOKE_SUBMISSION_TOKEN` makes the API drop all processors, so the run sends no email and no webhook (ADR 0052). Do not run a smoke against a deployed environment without the approval of the designer.

The Form Builder writes `Publish form:` PRs without this skill, so those PRs can make a spec stale.

## Common mistakes

| Mistake                                                                    | Fix                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Adding a `version` field, or a `recipes/<formId>/` directory               | Recipes are flat `recipes/<formId>.json` files, edited in place                                       |
| Renaming a recipe file without changing `formId` (or vice versa)           | The filename minus `.json` and the `formId` must match, or the API aborts at boot                     |
| Radio with 3+ options                                                      | Select for 3+; radio only for exactly 2 (Rule 8)                                                      |
| Repurposing a semantic component (e.g. `date-of-birth` for an expiry date) | Use the generic primitive with fieldId + label override (CATEGORY 0)                                  |
| `fieldConditionalOn`/`optionalIf` value set to a display label             | Values are always lowercased + kebab-cased option values (`"christ-church"`, never `"Christ Church"`) |
| Rediscovering conventions from loader source code                          | Everything you need is in the system prompt + this skill                                              |
| You change a recipe and leave its smoke spec stale or absent               | Create or update `apps/forms/e2e/smoke/<formId>.smoke.spec.ts` to agree with the new form (Step 4)    |
