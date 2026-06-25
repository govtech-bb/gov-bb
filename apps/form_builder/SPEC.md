# Form Builder — Feature Specification

A web application for authoring **form recipes** for the GovTech Barbados Modular Forms platform. A "recipe" is a versioned, JSON-shaped form definition that downstream apps consume to render a multi-step government service form. This builder is the authoring tool — it does not render the public-facing forms themselves.

Authoring happens on **one unified screen**: a visual, step-and-field editor with full control over every override, plus a **collapsible AI assistant sidebar** docked beside it. The AI assistant (Claude) converts a PDF or text description of a paper form into a recipe, or applies a text tweak to the form you're already editing — writing directly to the live draft, with no DB round trip.

---

## 1. Entry & Navigation

- The root URL (`/`) redirects to `/builder`.
- `/builder` *is* the editor — it lands directly in the visual builder with the AI sidebar docked on the right (expanded by default, collapsible). There is no separate landing page and no `/builder/ui` or `/builder/ai` route.

---

## 2. The visual editor (`/builder`)

### 2.1 Toolbar (form-level controls)

The toolbar at the top of the builder exposes:

- **Form ID** — kebab-case slug for the form. Validated inline against `^[a-z0-9][a-z0-9-]*$`; spaces are auto-replaced with hyphens; input is lowercased; an inline error appears if the value is invalid.
- **Title** — human-readable form title.
- **Version** — semver string (e.g. `1.0.0`), displayed as a badge. Auto-computed:
  - For an unknown form ID, defaults to `1.0.0`.
  - For a known form ID, fetches the current latest version and proposes the next minor (`1.2.3 → 1.3.0`).
  - Debounced so it only fires once the user stops typing the Form ID.
- **New** — clears the draft (with dirty-check confirmation).
- **Open** — opens the Form Picker (see §2.5).
- **Validate** — validates the current draft against the recipe schema (see §2.6).
- **Preview** — hydrates the recipe into a full `ServiceContract` and shows a read-only summary (see §2.7).
- **Submit** — opens the Submit modal (see §2.8). Disabled until the draft is valid and has at least one editable step with at least one field.
- **Status indicator** — shows the last action's result: `✓ Valid`, `✗ Invalid`, or `✓ Submitted`.

### 2.2 Step list (left panel)

- Steps are listed in order. Two **required tail steps** are always present and locked at the end of every form:
  - `declaration` — "Declaration"
  - `submission-confirmation` — "Submission Confirmation"
  These cannot be deleted, reordered, or renamed (their Step ID is read-only).
- **Add Step** inserts a new step *above* the required tail. New steps are given an auto-generated ID (`step-1`, `step-2`, …) and a placeholder title (`Step N`).
- Each editable step supports reorder (up/down), delete (with confirmation), and selection.
- A **Switch to AI Builder** shortcut sits at the top of the list.

### 2.3 Step editor (right panel)

When a step is selected, its details are editable:

- **Step ID** — kebab-case, validated against `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. If the user edits the title while the Step ID is still the default `step-N`, the Step ID is auto-derived (kebab-cased) from the title on blur.
- **Title**.
- **Description** — optional textarea.
- **Fields** — ordered list of the step's fields (see §2.4).
- **Step Behaviours** — conditional logic and step-level behaviours (see §2.9).

### 2.4 Field management

Fields are added through a **Field Picker** with four tabs:

| Tab | Source |
|---|---|
| **Primitives** | Built-in primitive components from the registry catalog |
| **Components** | The `REGISTRY_COMPONENTS` set from `@govtech-bb/registry` |
| **Blocks** | Composite block definitions (groups of related fields) |
| **Custom** | Custom components defined in the `custom_components` database table |

Once added to a step, each field supports:

- Reorder up/down within the step.
- Delete (with confirmation).
- Edit overrides via a modal (`FieldEditPanel`).

The override panel supports:

- **fieldId override** — must be unique within the form when present.
- **label**, **hint**, **placeholder**.
- **isHidden**, **isDisabled** toggles.
- **Required** quick toggle.
- **Validation Rules** — pulled from `VALIDATION_RULE_DESCRIPTORS` for the field's `htmlType`. Each rule may carry a `value`, a `referenceFieldId` (linked via a field-ref picker), and a custom `error` message.
- **Field Behaviours** — same UI as step behaviours but field-scoped (see §2.9).

**Blocks** are edited differently: instead of one override form, the panel shows one override form per child element inside the block, and the resulting `childOverrides` are stored under each child's `fieldId`.

A small "override dot" indicator appears next to any field that has at least one override applied.

### 2.5 Loading existing forms (Form Picker)

The **Open** dialog lists all forms in `form_definitions`, showing:

- Title (or formId fallback).
- Current version badge.
- A "Published" badge when `published_at` is set.

Selecting a form loads its latest version into the builder as an editable draft. The dirty-check confirmation runs first if applicable. Once loaded, the builder tracks both the original `formId` and `currentVersion` so subsequent submits behave as updates rather than creates.

### 2.6 Validation

The **Validate** action runs two layers:

1. **Pre-flight checks** with friendlier messages — e.g. "Add at least one step before the required Declaration and Submission Confirmation steps", or "Step \"X\" has no fields".
2. The serialized recipe is sent to `validateRecipe`, which delegates to `validateFormContract` from `@govtech-bb/form-builder`.

Results render in a dismissible **Validation Panel** at the bottom: either a green success banner or a list of issues with `path: message`.

### 2.7 Preview

The **Preview** modal calls `previewRecipe`, which hydrates the draft (resolves registry refs + applies overrides) into a full `ServiceContract` and displays:

- Form ID, title, version, total step count.
- Each step with its title, description, and the list of fields showing their resolved `label`, `htmlType`, and `fieldId`.

This is a *summary*, not an interactive rendering of the form.

### 2.8 Submitting

The **Submit** modal shows the formId, title, and an editable version field. Behaviour depends on whether the draft was loaded from an existing form:

- **Create mode** (no `loadedFromId`): calls `submitRecipe`, which inserts a new row. Fails if `(formId, version)` already exists.
- **Update mode** (loaded from existing): if the version equals the current version, calls `updateRecipe` — which overwrites the schema in place. Forbidden if the row is published or if versions don't match.
- After a successful submit, the version is auto-bumped to the next minor so a follow-up submit doesn't collide.

Client-side, the version must be a valid semver with major ≥ 1, and (in update mode) must be ≥ the current version.

### 2.9 Behaviours

Behaviours describe conditional logic and other field/step modifiers. The behaviour editor reads available types from `BEHAVIOUR_TYPE_DESCRIPTORS` and filters them by scope (`field` or `step`). Each behaviour has typed parameters:

- `fieldRef` — picker over all known field references in the draft.
- `stepRef` — dropdown of step IDs.
- `operator` — one of `equal`, `notEqual`, `in`, `exists`.
- `value`, `number`, `stringArray` — typed inputs.

Examples surfaced through descriptors include `fieldConditionalOn`, `stepConditionalOn`, and `repeatable` (these are defined in `@govtech-bb/form-builder` and the form-creation guide).

---

## 3. The AI assistant sidebar

A collapsible panel docked to the right of the editor, sharing the editor's live `draft` / `version` state. It is **stateless**: every action is a single, self-contained call to `POST /builder/ai/convert` — there is no server-side conversation, session, or growing history (closes #332). The transcript shown in the sidebar is held client-side for the session's lifetime only.

The system prompt is built per call from the base prompt plus a dynamically appended list of live custom components from the database, so the AI always knows which `components/<namespace>/<type>` refs it may use.

### 3.1 Two actions

- **Upload** — attach a PDF (or PNG/JPG) and convert it to a recipe. Stands alone: no accompanying message is required. The file is sent inline as base64; the sidebar guards uploads at **4 MB** client-side (the Amplify SSR Lambda caps request bodies at ~6 MB, and base64 inflates the payload ~1.4×). An oversize file is rejected before upload with a clear message; a 413 at the edge is decoded from TanStack Start's cryptic "Invariant failed".
- **Edit Form** — a text tweak (e.g. "make the email field required") applied to the current draft. The live draft is serialized and sent as `recipeJson` alongside the `message`; the AI returns the **full modified recipe** (full replacement, not a patch).

Loading state ("Thinking…") and errors are surfaced inline in the sidebar.

### 3.2 Recipe extraction

The server extracts a recipe JSON from the assistant's response by scanning for a fenced ` ```json ` block (or any fenced block / raw object) containing both `"formId"` and `"steps"`. If none is found — a purely conversational reply — `recipe` comes back `null` and the sidebar simply shows the reply, leaving the draft untouched.

### 3.3 Applying a recipe to the live draft

A returned recipe is applied through the editor's pipeline before it can replace the draft:

1. **Deserialize** the recipe into a draft (reusing the catalog).
2. **No-op guard** — if the result is structurally identical to the current draft (ignoring version, timestamps, and editor-only ids), nothing is applied and the version is not bumped.
3. **Validate** — a uniqueness pre-flight (`findRecipeIdCollisions`) followed by the server contract validator (`validateRecipe`). On failure the error is surfaced in the sidebar and the draft is **not** overwritten.
4. **Confirm** — if the editor already holds content, the user confirms before the overwrite.
5. **Apply** — `LOAD_DRAFT` replaces the draft and the working version's **patch** is bumped once.

Publishing is not the sidebar's job: the AI assistant only ever writes to the live draft. Saving and deploying stay the editor's existing Save draft / Deploy flow.

### 3.4 AI configuration

- Provider is selectable via `AI_PROVIDER` env var: `anthropic` (default) or `bedrock`.
- Model is selectable via `AI_MODEL`; defaults to `claude-sonnet-4-20250514` for Anthropic or `us.anthropic.claude-sonnet-4-6` for Bedrock.
- If `ANTHROPIC_API_KEY` is missing (and Bedrock isn't configured), AI features fail with a clear error.

---

## 4. Server functions (TanStack Start)

The app uses TanStack Start's `createServerFn` so all "API endpoints" are in-process server functions. Two groups:

**Form CRUD & registry**
- `listForms` — distinct forms, latest version of each, with title + published flag.
- `getRecipe(formId)` — latest recipe for a form.
- `submitRecipe(recipe)` — create a new `(formId, version)` row.
- `updateRecipe(formId, recipe)` — overwrite the latest unpublished row in place.
- `nextVersion(formId)` — current version + suggested next minor.
- `getCatalogFn` — builtin registry catalog + custom components (60s in-memory cache).
- `validateRecipe(recipe)` — runs `validateFormContract`.
- `previewRecipe(recipe)` — hydrates a recipe into a `ServiceContract`.

**AI assistant**
- `convertRecipe({ message?, recipeJson?, pdfBase64? })` — the single stateless AI call. Proxies `POST /builder/ai/convert` and returns `{ recipe, reply }` (`recipe` is `null` for a conversational reply). Edit Form sends `{ message, recipeJson }`; Upload sends `{ pdfBase64 }`.

---

## 5. Persistence

- **Database** — PostgreSQL via TypeORM, sharing the monorepo's `@govtech-bb/database` package. Connection is configured purely from `DB_*` env vars; `DB_SYNCHRONIZE` is gated to dev only.
- **Tables used**:
  - `form_definitions` — `(id, form_id, version, schema jsonb, published_at, created_at, updated_at)`. The builder reads/writes here directly.
  - `custom_components` — provides the "Custom" tab in the field picker and is appended to the AI system prompt.
- **AI assistant** — fully **stateless**. There is no server-side session store; each `convert` call is self-contained and survives a server restart with no loss (the sidebar carries the live recipe on every turn).
- **Catalog cache** — `getCatalogFn` caches the merged builtin + custom catalog for 60 seconds.

---

## 6. Domain model (recipes)

The shape produced by either authoring mode (full schema lives in `@govtech-bb/form-types` and is documented in `app/server/ai-builder/prompts/system-prompt.md`):

```
ServiceContractRecipe {
  formId, title, description?, version, createdAt, updatedAt,
  steps: [
    {
      stepId, title, description?, behaviours?,
      elements: [
        { ref: "components/…" | "blocks/…", overrides: { … }, childOverrides?: { … } }
      ]
    }
  ],
  processors: []
}
```

Notable rules enforced by the builder:

- `formId` is kebab-case.
- `version` is a major-≥-1 semver.
- Every form ends with a `declaration` step and a `submission-confirmation` step.
- Component elements must carry a `fieldId` override.
- `processors` is currently always an empty array.

---

## 7. Local development

- Run with `pnpm dev:form-builder-app` (Nx-orchestrated) or `npm run dev` from `apps/form_builder` (Vite + TanStack Start).
- `.env.example` documents the required env vars: `DB_*`, `PORT`, `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY`, optional `AWS_REGION`.
- Tests are Jest-based (see `*.spec.ts` files); runs via `npm test` inside the app.

---

## 8. Things to clarify with the team

> The following came up during exploration and aren't fully obvious from the code. They are not bugs by default — just questions to confirm intent.

1. ~~**In-memory AI sessions.**~~ *Resolved (#490/#332):* the AI assistant is now stateless — there is no server-side session `Map`. Each `convert` call is self-contained, so a restart loses nothing and horizontal scaling is unaffected.

2. **PDF handling under Anthropic vs. Bedrock.** Under the Anthropic provider, uploaded files are sent as base64 with `media_type: "image/png"` regardless of actual file type, while Bedrock receives a true `document/pdf` content block. The chat UI also accepts `.png/.jpg/.jpeg` in addition to `.pdf`. Is image-as-PDF intentional fallback, or should there be true PDF parsing on the Anthropic path?

3. **Unused PDF magic-byte validator.** `app/server/ai-builder/pdf-validation.ts` imports from `@nestjs/common` and exports an Express/Multer file filter, but the AI route accepts base64 directly from the client without invoking it. Should this be wired in, removed, or is it a leftover from an earlier NestJS-based design?

4. **Hardcoded preview URL.** After AI-publish, the preview link is hardcoded to `https://app-sandbox.alpha.gov.bb/forms/<formId>`. Should this be env-driven so it points to the right environment (sandbox vs. prod)?

5. **Required tail steps can be empty.** The "all editable steps have fields" gate excludes the required `declaration` and `submission-confirmation` steps, so a recipe can be submitted with empty declaration/confirmation steps. Is that intentional (their content comes from elsewhere downstream), or should the builder seed/require their fields?

6. **Two publish paths with different semantics.**
   - The UI builder's **Submit** sets `published_at = null` (creates an unpublished draft).
   - The AI builder's **Publish** sets `published_at = NOW()`.
   There is no "publish" button in the UI builder and no obvious unpublish flow. Combined with the design doc note that "publish/unpublish is out of scope — it will be removed", this looks transitional. What is the intended publish workflow?

7. **`processors` is always `[]`.** The schema requires a `processors` array and both authoring modes always emit `[]`. The codebase has SQL files that backfill processors after the fact. Is there a planned UI for editing processors, or are they always managed outside the builder?

8. **Custom components without a UI to manage them.** The Custom tab and the AI system prompt both read from the `custom_components` table, but there's no apparent UI in this app for creating/editing custom components. Where is that authored?

9. **Catalog cache TTL.** `getCatalogFn` caches the merged catalog for 60 seconds. If a custom component is added (presumably via another app or SQL), the AI system prompt won't see it until the cache expires. (Note: `convert` reads custom components live per call, so only the shared catalog cache applies.) Is 60s the right window, or should there be a cache-invalidation hook?

10. **`start` script vs. build output.** `package.json` declares `"start": "node dist/server/server.js"`, but the Vite/TanStack Start build target hasn't been verified to emit exactly that path. Worth confirming for production/Docker deployment.

11. **Recipe-extraction heuristic.** The AI server tries multiple strategies to extract JSON from free-form assistant text (fenced blocks, then brace-balanced substrings). If the AI returns multiple candidate JSON objects, the first that parses and contains `formId` + `steps` wins. Should the system prompt enforce a single, machine-friendly output format to remove that ambiguity?
