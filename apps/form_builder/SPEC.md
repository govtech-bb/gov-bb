# Form Builder — Feature Specification

A web application for authoring **form recipes** for the GovTech Barbados Modular Forms platform. A "recipe" is a versioned, JSON-shaped form definition that downstream apps consume to render a multi-step government service form. This builder is the authoring tool — it does not render the public-facing forms themselves.

Authoring happens on **one unified screen**: a visual, step-and-field editor with full control over every override, plus a **collapsible AI assistant sidebar** docked beside it. The AI assistant (Claude) converts a PDF or text description of a paper form into a recipe, or proposes a change to the current draft. Changes require review and explicit approval.

---

## 1. Entry & Navigation

- The root URL (`/`) redirects to `/builder`.
- `/builder` _is_ the editor — it lands directly in the visual builder with the AI sidebar docked on the right (expanded by default, collapsible). There is no separate landing page and no `/builder/ui` or `/builder/ai` route.

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
- **Add Step** inserts a new step _above_ the required tail. New steps are given an auto-generated ID (`step-1`, `step-2`, …) and a placeholder title (`Step N`).
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

| Tab            | Source                                                              |
| -------------- | ------------------------------------------------------------------- |
| **Primitives** | Built-in primitive components from the registry catalog             |
| **Components** | The `REGISTRY_COMPONENTS` set from `@govtech-bb/registry`           |
| **Blocks**     | Composite block definitions (groups of related fields)              |
| **Custom**     | Custom components defined in the `custom_components` database table |

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

This is a _summary_, not an interactive rendering of the form.

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

## 3. The AI assistant

A resizable sidebar serves both the form builder and content editor. It uses
the current draft and selection as context, offers Ask and Review edits modes,
and renders streamed replies with TanStack Markdown. Mobile uses a full-screen
native dialog; the panel supports keyboard resizing, Stop, Retry, and copying
replies. Shared AI components live under `app/components/ui/ai`; the form and
content adapters live with their respective editor components.

### 3.1 Transport and tools

The authenticated Start function `createAiAccess` obtains a short-lived token.
The browser then streams directly from `POST /builder/ai/chat`, avoiding the
Amplify SSR time limit. The API uses the latest pinned official TanStack AI and
Bedrock packages, the existing domain prompts, and allowlisted lookup,
validation, and proposal tools. There is no fenced-JSON extraction or model
job polling. The provider remains AWS Bedrock.

### 3.2 Review before applying

Form proposals are structurally parsed, normalized through the editor reducer,
and validated against the contract and registry. Content proposals use a
strict field allowlist. Review shows the actual changes and repair warnings.
Only explicit approval can call the client edit tool, once, while the same
draft revision and editing permission still hold. Closing the assistant,
unmounting, or losing the editing claim prevents delayed application.

Semantic errors may be applied as a repairable draft after review. Structural
errors and validation-service failures block Apply. Save and Deploy retain
their strict gates. Payment settings, MDA selection, credentials, opaque
metadata, and fixed content paths remain protected.

### 3.3 Documents and recovery

Authors can attach a PDF up to 20 MB or PNG/JPEG up to 10 MB through a direct
S3 POST. Type, size, extension, and signature checks precede Textract. A signed
owner-bound reference lets retries poll the same extraction instead of
uploading again. Ready documents join the next message as context. Stop
aborts model work and local upload/polling; Textract may finish remotely.

### 3.4 Conversation history

TanStack's IndexedDB persistence stores an inert transcript, indexed by user
and form/page in localStorage. Restoring never replays tools, reapplies a
draft, or resumes a pending approval. Interrupted conversations offer Retry
against the current editor state. History deletion removes the transcript and
document reference. Storage failures remain visible without blocking chat.

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

- `createAiAccess()` — authenticated, server-only token exchange. Chat and
  document requests then go directly from the browser to the API.

---

## 5. Persistence

- **Database** — PostgreSQL via TypeORM, sharing the monorepo's `@govtech-bb/database` package. Connection is configured purely from `DB_*` env vars; `DB_SYNCHRONIZE` is gated to dev only.
- **Tables used**:
  - `form_definitions` — `(id, form_id, version, schema jsonb, published_at, created_at, updated_at)`. The builder reads/writes here directly.
  - `custom_components` — provides the "Custom" tab in the field picker and is appended to the AI system prompt.
- **AI assistant** — browser-local history; the API keeps no model job or conversation store. Every request carries bounded conversation context and the current editor snapshot.
- **Catalog cache** — `getCatalogFn` caches the merged builtin + custom catalog for 60 seconds.

---

## 6. Domain model (recipes)

The shape produced by either authoring mode (full schema lives in `@govtech-bb/form-types` and is documented in `../form_builder_api/src/ai/system-prompt.ts`):

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
- `.env.example` documents the required env vars: the frontend API/auth settings and backend Bedrock/S3/Textract configuration.
- Tests use Vitest (see `*.spec.ts` files); run `pnpm test` inside the app.

---

## 8. Current AI architecture

See [ADR 0072](../../docs/decisions/0072-builder-ai-streams-with-reviewed-client-edits.md)
for the streaming, approval, persistence, and upload contracts.
