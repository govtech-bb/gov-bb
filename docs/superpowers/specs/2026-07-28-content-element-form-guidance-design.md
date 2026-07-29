# Content element — static guidance inside a form step

**Date:** 2026-07-28
**Status:** Approved design, ready for implementation plan

## Problem

The temporary-restaurant-licence prototype
(`https://govtech-bb.github.io/newforms/Prototypes/temporary-restaurant-licence.html?dev`)
shows conditional **guidance content** on the "Are you organising this event?"
step when the applicant answers **Yes** — content that does not exist in the
live form. It is three pieces:

1. An **inset/callout box**: "As the event organiser, you must also request an
   environmental health officer to attend. This is required whenever food is
   served."
2. A **guidance paragraph** (with bold emphasis): "We will request an officer
   for you when you submit this application. The Environmental Health Department
   decides when officers attend, at their discretion, based on the event dates
   and times you have provided. You **do not need** to fill out a separate
   Request an environmental health officer form."
3. A collapsible **details disclosure**, summary "Why you do not choose officer
   times", body: "The Environmental Health Department assigns officers based on
   your event's dates and times. This follows the Health Services (Assignment of
   Public Health Inspectors to Private Businesses) Regulations, 1986, which set
   officers' working days and hours (regulation 2 and the First Schedule) and
   the fees for attendance outside those hours (regulation 7 and the Second
   Schedule)."

**The platform cannot express any of this today.** Every element in a step's
`elements` array must be a form field (a `Primitive` with a value). There is no
static-content element type. The `content` override key that a couple of recipes
use (`statement-of-travelling-form.json`, `non-nationals-secondary-entry.json`)
is **silently stripped** at recipe parse — it is not in `fieldOverridesSchema`'s
allowlist — and renders an empty disclosure. So the guidance is not reproducible
by editing the recipe alone.

## Decision

Add a first-class **non-field content element** (`htmlType: "content"`) that
renders static markdown guidance, carries **no submission value**, and is
excluded from validation, the check-your-answers summary, the reviewer email,
and the webhook mapping. One element models all three presentations via a
`variant` enum. It reuses the existing `fieldConditionalOn` behaviour for
conditional display, so no new conditionality machinery is needed.

Approach chosen over the two alternatives:
- **Conditional content-only step** (recipe-only, no code): rejected — it would
  be a separate page rather than inline, and markdown-only rendering can't
  produce the inset box or the collapsible details.
- **File an issue, no change**: rejected — the guidance is needed now.

## Design

### 1. Schema — `packages/form-types/src/primitive.type.ts`

- Add `"content"` to `htmlTypesSchema`.
- Add `export const contentVariantSchema = z.enum(["inset", "text", "details"])`.
- Add three optional keys to `basePrimitiveSchema` (mirrors how `options`,
  `groups`, `mask`, `step` already live on the base and are narrowed per type):
  - `content: z.string().optional()` — the markdown body.
  - `variant: contentVariantSchema.optional()`.
  - `summary: z.string().optional()` — the clickable text for the `details`
    variant.
- Add the discriminated variant and register it in `primitiveSchema`:
  ```ts
  export const contentPrimitiveSchema = basePrimitiveSchema.extend({
    htmlType: z.literal("content"),
    content: z.string(),
    variant: contentVariantSchema,
  });
  export type ContentPrimitive = z.infer<typeof contentPrimitiveSchema>;
  ```
- Add `content`, `variant`, `summary` to `fieldOverridesSchema.pick(...)`.
  **Without this the recipe keys are stripped** — the exact bug that makes the
  existing `content` overrides no-ops.

### 2. Registry — `packages/registry/src/components/content.ts` (+ `index.ts`)

```ts
import type { ContentPrimitive } from "@govtech-bb/form-types";

export const Content: ContentPrimitive = {
  fieldId: "content",
  htmlType: "content",
  label: "Information",
  variant: "text",
  content: "",
};
```

Register under key `content` (→ ref `components/content`). Update the
builtin-registry snapshot test. `label` stays a required base key; the content
renderer never displays it (the `details` variant shows `summary`).

### 3. Client type — `apps/forms/src/types/field-mapper.type.ts`

`ClientPrimitive` is a hand-written interface (not derived from `Primitive`), so
add optional `content` / `variant` / `summary`. `htmlType: "content"` flows in
automatically because it references the shared `HtmlTypes` enum. Runtime values
already survive via the `...field` spread in `mapFieldToLocale`; this only adds
the missing TS types.

### 4. Renderer — `apps/forms/`

- **`field-renderer/index.tsx`**: handle `content` **before** the
  `<form.Field>` wrapper — immediately after the existing `fieldConditionalOn`
  visibility block (~line 79) — and return the content markup directly. This
  keeps a content element **out of form state entirely**: no registered field,
  no value, no validation, never in the submission payload. Conditional
  show/hide still works because the early return sits *after* the
  `fieldConditionalOn` check that returns `null` when the condition is unmet.
- **New `field-renderer/content-field.tsx`**, switching on `variant`:
  - `inset` → `<div className="govbb-inset-text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>`
  - `text` → `<div className="govbb-content-text">` + same markdown
  - `details` → native
    `<details className="govbb-show-hide"><summary className="govbb-show-hide__summary">{summary}</summary><div className="govbb-show-hide__content"><ReactMarkdown …>{content}</ReactMarkdown></div></details>`
  Markdown uses `react-markdown` + `remark-gfm` with **no `rehype-raw`** — the
  same configuration the intro/confirmation `markdownContent` already uses (raw
  HTML stays escaped). Supports bold, links, lists.
- **CSS — `apps/forms/src/styles/govtech.css`**: add `.govbb-inset-text`
  reusing the existing inset tokens (`background: var(--color-blue-10)`,
  `border-left: var(--color-blue-40) 0.25rem solid`, as `.form-page__closed-panel`),
  plus a small `.govbb-content-text` spacing wrapper. Reuse existing
  `.govbb-show-hide*` classes for the details variant and the existing markdown
  styles.

### 5. Defensive exclusion filters

A valueless content element is *already* dropped everywhere by empty-value
filters, but add explicit `htmlType === "content"` guards next to the existing
`show-hide` ones for clarity and against a content element that somehow carries
a value:

- `apps/forms/src/components/review.tsx` — add `content` to the summary filter
  chain (beside the `show-hide` filter).
- `apps/api/src/email/email-body.builder.ts` — add `"content"` to `SKIP_TYPES`.
- `apps/forms/src/lib/form-builder/validation-builder.ts` — add `"content"`
  beside `"show-hide"` in `buildFieldValidationProperties` and
  `collectStepErrorCodes`; guard the `defaultValue` seeding line so a content
  element never seeds form state.
- **No change** to the webhook mapping (`webhook-mapping.ts`) or submission
  assembly (`formatDataForSubmission`) — both iterate *submitted values*, where a
  valueless element never appears.

### 6. Recipe — `apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json`

In the `event-organiser` step, add three `components/content` elements, each
carrying `behaviours: [{ type: "fieldConditionalOn", targetFieldId:
"is-organiser", operator: "equal", value: "yes" }]`, reproducing the prototype
copy verbatim:

1. `variant: "inset"` — the environmental-health-officer callout.
2. `variant: "text"` — the "we will request an officer … **do not need** …"
   paragraph.
3. `variant: "details"` — summary "Why you do not choose officer times", body
   the Regulations 1986 explanation.

Each needs a unique kebab-case `fieldId` (e.g. `organiser-officer-notice`,
`organiser-officer-info`, `organiser-officer-reg-note`). Bump `updatedAt`.

### 7. Testing (TDD)

- **form-types**: a content primitive parses; `fieldOverridesSchema` carries
  `content`/`variant`/`summary`; unrelated unknown keys still stripped.
- **registry**: `Content` resolves; builtin-registry snapshot updated.
- **forms renderer** (`field-renderer.spec.tsx`): inset/text/details each
  render; markdown bold renders; hidden when the `fieldConditionalOn` condition
  is unmet; a content element registers **no** form field (no value reaches the
  submission).
- **review**: content element excluded from the check-your-answers summary.
- **api**: content survives hydration/resolution; excluded from the reviewer
  email body.
- **recipe-invariants** (`recipe-invariants.spec.ts`): passes with the new
  elements in the recipe.

### 8. Naming

- Element ref `components/content`; override keys `content` / `variant` /
  `summary`; variant values `inset` / `text` / `details`. `variant` sits on the
  base schema but is only meaningful for the content element.

### 9. Branch / PR

New branch `content-element-form-guidance` off `main`, separate from the open
check-your-answers PR #2108. Both edit the recipe file but in different regions
(#2108 adds a `check-your-answers` step + `excludeSteps` entry; this adds
content elements to `event-organiser`) → trivially mergeable. This PR ships the
content element **and** its first real use.

## Out of scope

- No new conditionality mechanism — reuses `fieldConditionalOn`.
- No `rehype-raw` / raw-HTML support in markdown.
- No form-builder AI / system-prompt guidance for the new component (can follow
  once the element lands).
- Not fixing the pre-existing dead `content` overrides in other recipes (mention
  only).
