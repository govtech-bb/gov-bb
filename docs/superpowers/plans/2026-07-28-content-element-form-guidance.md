# Content Element (Static Form Guidance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-field `content` form element (variants inset/text/details, markdown body) so conditional guidance can be authored inline in a step recipe, and use it to add the missing environmental-health-officer guidance to the temporary-restaurant-licence form.

**Architecture:** A new `htmlType: "content"` joins the `Primitive` discriminated union in `@govtech-bb/form-types`, ships as a `components/content` registry component, and is rendered by the forms app **before** the TanStack `<form.Field>` wrapper so it never enters form state (no value, no validation, never submitted). Conditional display reuses the existing `fieldConditionalOn` behaviour. Contract-iterating consumers (review summary, reviewer email, validation builder) get explicit `htmlType === "content"` skips.

**Tech Stack:** TypeScript, Zod (schema), nx + `@nx/js:tsc` (project-references build), Vitest 4 (tests; forms uses jsdom, api uses unplugin-swc), React + `react-markdown` + `remark-gfm` (renderer).

## Global Constraints

- **Package manager:** pnpm only, never npm.
- **Build:** `pnpm exec nx run-many -t build --exclude=landing` must pass (landing prebuild needs network).
- **Monorepo rule:** a strict-tsc library importing a package requires that package to be a buildable nx project AND listed in the importer's tsconfig `references`. (No new cross-package edges are introduced here — form-types → registry → forms/api already exist.)
- **IDs:** every `fieldId` is kebab-case `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`.
- **Recipe invariants:** `formId` in JSON equals directory/filename base; flat single-file recipe edited in place (this recipe has no `version` field).
- **Conditional `value`:** always the watched field's kebab-case option value (`"yes"`, never `"Yes"`).
- **Markdown:** `react-markdown` + `remark-gfm`, **no `rehype-raw`** (raw HTML stays escaped) — matches the existing `markdownContent` renderer.
- **Copy:** the recipe guidance text is reproduced **verbatim** from the prototype (see Task 6); do not paraphrase.
- **Commit trailer:** end each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Branch:** `content-element-form-guidance` (already created off `main`).

---

### Task 1: Schema — `content` primitive in form-types

**Files:**
- Modify: `packages/form-types/src/primitive.type.ts`
- Test: `packages/form-types/src/primitive.type.spec.ts` (create if absent)

**Interfaces:**
- Produces: `htmlTypesSchema` gains `"content"`; `contentVariantSchema` (`z.enum(["inset","text","details"])`); `contentPrimitiveSchema`; `ContentPrimitive` type; `basePrimitiveSchema` gains optional `content: string`, `variant: contentVariantSchema`, `summary: string`; `fieldOverridesSchema` accepts `content`/`variant`/`summary`.

- [ ] **Step 1: Write the failing test**

Create `packages/form-types/src/primitive.type.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  primitiveSchema,
  fieldOverridesSchema,
  contentVariantSchema,
} from "./primitive.type";

describe("content primitive", () => {
  it("parses a content element with variant + body", () => {
    const parsed = primitiveSchema.parse({
      fieldId: "officer-notice",
      label: "Information",
      htmlType: "content",
      variant: "inset",
      content: "As the event organiser, you must request an officer.",
    });
    expect(parsed.htmlType).toBe("content");
  });

  it("rejects a content element missing content/variant", () => {
    expect(() =>
      primitiveSchema.parse({
        fieldId: "officer-notice",
        label: "Information",
        htmlType: "content",
      }),
    ).toThrow();
  });

  it("accepts a summary for the details variant", () => {
    expect(contentVariantSchema.parse("details")).toBe("details");
  });

  it("keeps content/variant/summary through field overrides", () => {
    const o = fieldOverridesSchema.parse({
      content: "body",
      variant: "details",
      summary: "Why you do not choose officer times",
    });
    expect(o).toEqual({
      content: "body",
      variant: "details",
      summary: "Why you do not choose officer times",
    });
  });

  it("still strips unknown override keys", () => {
    const o = fieldOverridesSchema.parse({ bogus: "x", content: "body" });
    expect(o).toEqual({ content: "body" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run form-types:test -- primitive.type`
Expected: FAIL — `"content"` not a valid htmlType / `contentVariantSchema` undefined.

- [ ] **Step 3: Implement the schema**

In `packages/form-types/src/primitive.type.ts`:

1. Add `"content"` to `htmlTypesSchema` enum (append after `"address-lookup"`).

2. After `optionGroupSchema` (before `primitiveUISchema`), add:

```ts
export const contentVariantSchema = z.enum(["inset", "text", "details"]);
export type ContentVariant = z.infer<typeof contentVariantSchema>;
```

3. In `basePrimitiveSchema`, add three optional keys (place them after `geocodeTargets`):

```ts
  // Content element (htmlType "content"): a non-field static guidance block.
  // `content` is the markdown body; `variant` selects the presentation; the
  // `details` variant uses `summary` as the disclosure's clickable text.
  content: z.string().optional(),
  variant: contentVariantSchema.optional(),
  summary: z.string().optional(),
```

4. After `addressLookupPrimitiveSchema`, add:

```ts
// A non-field static content block: renders markdown guidance (inset callout,
// plain paragraph, or a collapsible details disclosure). Carries no submitted
// value — the renderer draws it outside the form-field wrapper, so it is never
// validated, summarised, or submitted.
export const contentPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("content"),
  content: z.string(),
  variant: contentVariantSchema,
});
export type ContentPrimitive = z.infer<typeof contentPrimitiveSchema>;
```

5. Add `contentPrimitiveSchema` to the `primitiveSchema` discriminated union array (append after `addressLookupPrimitiveSchema`).

6. In `fieldOverridesSchema`'s `.pick({...})`, add:

```ts
    content: true,
    variant: true,
    summary: true,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec nx run form-types:test -- primitive.type`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/form-types/src/primitive.type.ts packages/form-types/src/primitive.type.spec.ts
git commit -m "feat(form-types): add content primitive (inset/text/details variants)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Registry — `components/content` component

**Files:**
- Create: `packages/registry/src/components/content.ts`
- Modify: `packages/registry/src/components/index.ts` (export, import, `ALL`, `_componentCount`)
- Test: `packages/registry/src/builtin-registry.spec.ts` (update completeness expectation)

**Interfaces:**
- Consumes: `ContentPrimitive` from Task 1.
- Produces: `Content` component, resolvable as `components/content`; `REGISTRY_COMPONENTS["components/content"]`.

- [ ] **Step 1: Write the failing test**

Add to `packages/registry/src/builtin-registry.spec.ts` (a new `it` within the existing describe):

```ts
it("resolves components/content with defaults", () => {
  const c = REGISTRY_COMPONENTS["components/content"];
  expect(c).toBeDefined();
  expect(c.htmlType).toBe("content");
  expect(c.variant).toBe("text");
});
```

(Ensure `REGISTRY_COMPONENTS` is imported in the spec — it is used elsewhere in that file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run registry:test -- builtin-registry`
Expected: FAIL — `components/content` is `undefined`. (The `_componentCount: 50` literal will also start erroring once ALL grows — expected until Step 3.)

- [ ] **Step 3: Implement the component**

Create `packages/registry/src/components/content.ts`:

```ts
import type { ContentPrimitive } from "@govtech-bb/form-types";

// A non-field static content block. Recipes override `variant`, `content`
// (markdown body), `summary` (details variant) and `fieldId`. The `label`
// default is never rendered — inset/text show only `content`; details shows
// `summary`.
export const Content: ContentPrimitive = {
  fieldId: "content",
  htmlType: "content",
  label: "Information",
  variant: "text",
  content: "",
};
```

In `packages/registry/src/components/index.ts`:
1. Add `export { Content } from "./content";` (alphabetical, after the `Confirmation` export line).
2. Add `import { Content } from "./content";` (after the `Confirmation` import line).
3. Add `Content,` to the `ALL` array (after `Confirmation,`).
4. Bump the completeness guard: `const _componentCount: 51 = ALL.length;` (was `50`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec nx run registry:test`
Expected: PASS (all registry specs, including the new one).

- [ ] **Step 5: Commit**

```bash
git add packages/registry/src/components/content.ts packages/registry/src/components/index.ts packages/registry/src/builtin-registry.spec.ts
git commit -m "feat(registry): add components/content component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Client type — `ClientPrimitive` carries content keys

**Files:**
- Modify: `apps/forms/src/types/field-mapper.type.ts:17-42`
- Test: `apps/forms/src/lib/form-builder/field-mapper.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `HtmlTypes` already includes `"content"` (Task 1).
- Produces: `ClientPrimitive` has optional `content`, `variant`, `summary`. `mapFieldToLocale` already spreads `...field`, so values flow at runtime.

- [ ] **Step 1: Write the failing test**

Create `apps/forms/src/lib/form-builder/field-mapper.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapFieldToLocale } from "./field-mapper";
import type { FormStep, Primitive } from "@govtech-bb/form-types";

describe("mapFieldToLocale — content element", () => {
  it("carries variant/content/summary onto the client field", () => {
    const step = { stepId: "s", title: "S", elements: [] } as unknown as FormStep;
    const field = {
      fieldId: "officer-notice",
      label: "Information",
      htmlType: "content",
      variant: "inset",
      content: "Body text.",
    } as unknown as Primitive;

    const mapped = mapFieldToLocale(field, step);
    expect(mapped.htmlType).toBe("content");
    expect(mapped.variant).toBe("inset");
    expect(mapped.content).toBe("Body text.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run forms:test -- field-mapper`
Expected: FAIL — TS error: `variant`/`content` not on `ClientPrimitive`.

- [ ] **Step 3: Add the interface keys**

In `apps/forms/src/types/field-mapper.type.ts`, inside `interface ClientPrimitive`, after the `geocodeTargets` field, add:

```ts
  /** Content element (`htmlType: "content"`) markdown body. */
  content?: string;
  /** Content element presentation: "inset" | "text" | "details". */
  variant?: "inset" | "text" | "details";
  /** Content element `details`-variant disclosure summary. */
  summary?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec nx run forms:test -- field-mapper`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/forms/src/types/field-mapper.type.ts apps/forms/src/lib/form-builder/field-mapper.spec.ts
git commit -m "feat(forms): ClientPrimitive carries content/variant/summary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Renderer — content-field component + early return + CSS

**Files:**
- Create: `apps/forms/src/components/field-renderer/content-field.tsx`
- Modify: `apps/forms/src/components/field-renderer/index.tsx` (early return before `<form.Field>`)
- Modify: `apps/forms/src/styles/govtech.css` (`.govbb-inset-text`, `.govbb-content-text`)
- Test: `apps/forms/src/components/field-renderer/content-field.spec.tsx`

**Interfaces:**
- Consumes: `ClientPrimitive` with `variant`/`content`/`summary` (Task 3).
- Produces: `renderContentElement(field: ClientPrimitive): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `apps/forms/src/components/field-renderer/content-field.spec.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderContentElement } from "./content-field";
import type { ClientPrimitive } from "@forms/types";

const base = {
  id: "s_n",
  fieldId: "n",
  stepId: "s",
  name: "n",
  label: "Information",
  htmlType: "content",
  disabled: false,
  hidden: false,
  conditionallyHidden: false,
} as unknown as ClientPrimitive;

describe("renderContentElement", () => {
  it("renders inset markdown with bold", () => {
    render(
      renderContentElement({
        ...base,
        variant: "inset",
        content: "You **do not need** a form.",
      }),
    );
    expect(screen.getByText("do not need").tagName).toBe("STRONG");
    expect(document.querySelector(".govbb-inset-text")).not.toBeNull();
  });

  it("renders a details disclosure with summary + body", () => {
    render(
      renderContentElement({
        ...base,
        variant: "details",
        summary: "Why you do not choose officer times",
        content: "The Environmental Health Department assigns officers.",
      }),
    );
    expect(
      screen.getByText("Why you do not choose officer times").tagName,
    ).toBe("SUMMARY");
    expect(
      screen.getByText(/Environmental Health Department assigns/),
    ).not.toBeNull();
  });

  it("renders plain text variant", () => {
    render(
      renderContentElement({ ...base, variant: "text", content: "Plain." }),
    );
    expect(document.querySelector(".govbb-content-text")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec nx run forms:test -- content-field`
Expected: FAIL — `./content-field` module not found.

- [ ] **Step 3: Implement the content-field renderer**

Create `apps/forms/src/components/field-renderer/content-field.tsx`:

```tsx
import { JSX } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ClientPrimitive } from "@forms/types";

// Renders a non-field content block. Called directly by FieldRenderer, outside
// the TanStack <form.Field> wrapper, so it holds no value and is never
// validated or submitted. Markdown matches the confirmation-copy renderer:
// remark-gfm only, no rehype-raw (raw HTML stays escaped).
export function renderContentElement(field: ClientPrimitive): JSX.Element {
  const body = (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {field.content ?? ""}
    </ReactMarkdown>
  );

  switch (field.variant) {
    case "inset":
      return <div className="govbb-inset-text">{body}</div>;
    case "details":
      return (
        <details className="govbb-show-hide">
          <summary className="govbb-show-hide__summary">
            {field.summary ?? field.label}
          </summary>
          <div className="govbb-show-hide__content">{body}</div>
        </details>
      );
    case "text":
    default:
      return <div className="govbb-content-text">{body}</div>;
  }
}
```

In `apps/forms/src/components/field-renderer/index.tsx`:
1. Add import near the other renderer imports: `import { renderContentElement } from "./content-field";`
2. Insert an early return immediately after the conditional-visibility block (after the line `if (field.conditionallyHidden) field.conditionallyHidden = false;`, i.e. after line ~79, BEFORE the `return ( <form.Field ...>`):

```tsx
  // Content elements carry no value — render outside the form-field wrapper so
  // they never enter form state, validation, or the submission. They still
  // respect fieldConditionalOn: the visibility check above already returned
  // null when the condition is unmet.
  if (field.htmlType === "content") {
    return renderContentElement(field);
  }
```

- [ ] **Step 4: Add CSS**

In `apps/forms/src/styles/govtech.css`, append near the markdown-content section (after the `.form-page__closed-panel` block or the markdown section around line 469):

```css
/* ---- Content element (htmlType "content") ------------------------------- *
 * Inset variant: light-blue panel with a navy left rule (same tokens as the
 * service-title caption and closed panel). Text variant: block spacing only;
 * the details variant reuses the .govbb-show-hide* classes. */
.govbb-inset-text {
  padding: var(--spacing-s) var(--spacing-m);
  margin-bottom: var(--spacing-m);
  background: var(--color-blue-10);
  border-left: var(--color-blue-40) 0.25rem solid;
}

.govbb-inset-text > :last-child,
.govbb-content-text > :last-child {
  margin-bottom: 0;
}

.govbb-content-text {
  margin-bottom: var(--spacing-m);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec nx run forms:test -- content-field`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/forms/src/components/field-renderer/content-field.tsx apps/forms/src/components/field-renderer/index.tsx apps/forms/src/styles/govtech.css apps/forms/src/components/field-renderer/content-field.spec.tsx
git commit -m "feat(forms): render content element (inset/text/details) outside form state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Defensive exclusion filters (summary, reviewer email, validation)

**Files:**
- Modify: `apps/forms/src/components/review.tsx:151-160`
- Modify: `apps/api/src/email/email-body.builder.ts:307`
- Modify: `apps/forms/src/lib/form-builder/validation-builder.ts` (lines ~37, ~180, ~277)
- Test: `apps/forms/src/components/review.spec.tsx` (add case) and `apps/api/src/email/email-body.builder.spec.ts` (add case)

**Interfaces:**
- Consumes: content elements from Task 4; `htmlType === "content"`.
- Produces: content elements excluded from check-your-answers summary and reviewer email; never seed form defaults.

- [ ] **Step 1: Write the failing tests**

In `apps/forms/src/components/review.spec.tsx`, add a case asserting a `content` element does not produce a summary row. Model it on the existing `show-hide` exclusion test in that file (find the test that asserts `show-hide` fields are filtered and mirror it with a `content` field: give the step a content element + one real field, render `<Review>`, assert the content element's body text is absent from the summary while the real field's row is present).

In `apps/api/src/email/email-body.builder.spec.ts`, add a case: a contract step containing a `content` element plus a text field, with submitted values for the text field only, produces an email body that includes the text field's label but NOT the content element's label/body. Mirror the existing `show-hide` skip test if present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec nx run forms:test -- review` and `pnpm exec nx run api:test -- email-body`
Expected: FAIL — content body currently leaks into summary/email.

- [ ] **Step 3: Add the filters**

1. `apps/forms/src/components/review.tsx` — in the `rows` filter chain (line ~152), add a filter beside the `show-hide` one:

```tsx
    .filter((field) => field.htmlType !== "show-hide")
    .filter((field) => field.htmlType !== "content")
```

2. `apps/api/src/email/email-body.builder.ts` line ~307 — add `"content"` to the skip set:

```ts
const SKIP_TYPES = new Set<Primitive["htmlType"]>(["show-hide", "content"]);
```

3. `apps/forms/src/lib/form-builder/validation-builder.ts`:
   - Line ~37, guard the default seeding so content never enters form state:

```ts
      if (field.htmlType !== "content" && field.defaultValue) {
        defaults[field.id] = field.defaultValue;
      }
```

   - Line ~180 in `buildFieldValidationProperties`:

```ts
  if (
    field.htmlType === "show-hide" ||
    field.htmlType === "content" ||
    !field.validations
  ) {
```

   - Line ~277 in `collectStepErrorCodes`:

```ts
    if (
      field.htmlType === "show-hide" ||
      field.htmlType === "content" ||
      !field.validations
    )
      continue;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec nx run forms:test -- review` and `pnpm exec nx run api:test -- email-body`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/forms/src/components/review.tsx apps/api/src/email/email-body.builder.ts apps/forms/src/lib/form-builder/validation-builder.ts apps/forms/src/components/review.spec.tsx apps/api/src/email/email-body.builder.spec.ts
git commit -m "feat: exclude content elements from summary, reviewer email, validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Recipe — add conditional officer guidance

**Files:**
- Modify: `apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json`
- Test: `apps/api/src/forms/form-definitions/recipe-invariants.spec.ts` (run existing)

**Interfaces:**
- Consumes: `components/content` (Task 2), `fieldConditionalOn`.

- [ ] **Step 1: Add the three content elements**

In the `event-organiser` step's `elements` array, **after** the `organiser-email` element (the last element, line ~245) and before the closing `]`, append (mind the comma after the previous element's closing `}`):

```json
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "organiser-officer-notice",
            "variant": "inset",
            "content": "As the event organiser, you must also request an environmental health officer to attend. This is required whenever food is served.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "is-organiser",
                "operator": "equal",
                "value": "yes"
              }
            ]
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "organiser-officer-info",
            "variant": "text",
            "content": "We will request an officer for you when you submit this application. The Environmental Health Department decides when officers attend, at their discretion, based on the event dates and times you have provided. You **do not need** to fill out a separate Request an environmental health officer form.",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "is-organiser",
                "operator": "equal",
                "value": "yes"
              }
            ]
          }
        },
        {
          "ref": "components/content",
          "overrides": {
            "fieldId": "organiser-officer-reg-note",
            "variant": "details",
            "summary": "Why you do not choose officer times",
            "content": "The Environmental Health Department assigns officers based on your event's dates and times. This follows the Health Services (Assignment of Public Health Inspectors to Private Businesses) Regulations, 1986, which set officers' working days and hours (regulation 2 and the First Schedule) and the fees for attendance outside those hours (regulation 7 and the Second Schedule).",
            "behaviours": [
              {
                "type": "fieldConditionalOn",
                "targetFieldId": "is-organiser",
                "operator": "equal",
                "value": "yes"
              }
            ]
          }
        }
```

Also bump `"updatedAt"` to `"2026-07-28T00:00:00Z"`.

- [ ] **Step 2: Run recipe-invariants**

Run: `cd apps/api && npx vitest run recipe-invariants --coverage.enabled=false`
Expected: PASS (JSON is schema-valid; `components/content` resolves; conditional behaviours valid).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/forms/form-definitions/recipes/apply-for-temporary-restaurant-licence.json
git commit -m "feat(forms): add conditional officer guidance to temp restaurant licence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full build, full tests, open PR

**Files:** none (verification + PR).

- [ ] **Step 1: Build all packages (excluding landing)**

Run: `pnpm exec nx run-many -t build --exclude=landing`
Expected: all projects compile. If a strict-tsc TS6059/TS6307 appears, a tsconfig `references` edge is missing — but no new cross-package import is introduced here, so this should pass.

- [ ] **Step 2: Run the touched projects' full test suites**

Run: `pnpm exec nx run-many -t test --projects=form-types,registry,forms,api`
Expected: all pass (coverage gates satisfied because full project suites run).

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin content-element-form-guidance
gh pr create --base main \
  --title "feat(forms): content element for inline conditional guidance" \
  --body "$(cat <<'BODY'
## What

Adds a non-field `content` form element (variants `inset` / `text` / `details`, markdown body) so conditional guidance can be authored inline in a step recipe, and uses it to add the missing environmental-health-officer guidance to the **temporary restaurant licence** form (shown when the applicant is the event organiser).

Design spec: `docs/superpowers/specs/2026-07-28-content-element-form-guidance-design.md`

## How

- `@govtech-bb/form-types`: new `content` htmlType + `contentPrimitiveSchema`; `content`/`variant`/`summary` added to base + override allowlist.
- `@govtech-bb/registry`: `components/content` component.
- forms app: renders content **outside** the `<form.Field>` wrapper, so it holds no value and is never validated or submitted; reuses `fieldConditionalOn` for conditional display.
- Defensive `htmlType === "content"` skips in the check-your-answers summary, reviewer email (`SKIP_TYPES`), and validation builder. Webhook mapping needs no change (it iterates submitted values).

## Verification

- `nx run-many -t build --exclude=landing` passes.
- Full suites for form-types, registry, forms, api pass, incl. `recipe-invariants`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 4: Report the PR URL.**

---

## Notes for the implementer

- The open PR #2108 (check-your-answers step) also edits this recipe, in a different region. If it merges first, rebase and resolve trivially.
- Do NOT add `rehype-raw`; raw HTML must stay escaped (matches existing markdown behaviour).
- The pre-existing dead `content` overrides in `statement-of-travelling-form.json` / `non-nationals-secondary-entry.json` are out of scope — leave them.
- If `apps/forms` component tests need a jsdom environment marker, follow the pattern already in `field-renderer.spec.tsx` (that file renders components, so its setup is the reference).
