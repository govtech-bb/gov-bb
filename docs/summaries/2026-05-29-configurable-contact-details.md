# Configurable service "Contact Details" in the form builder (#452)

## Context

A service's **Contact Details** (organisation title, telephone, email, optional
address) were defined on `contactDetailsSchema` (both `serviceContractSchema` and
`serviceContractRecipeSchema`) and rendered by `apps/forms`
(`submission-confirmation.tsx`), but dropped at every layer in between — so the
field was a dead feature end-to-end, and any recipe that already had contact
details lost them silently the moment it was opened and re-saved in the builder.

The plan (`docs/plans/452-configurable-contact-details.md`) identified three drop
points; in practice they map to four carry points (serializer + deserializer
count separately). The fix promotes `contactDetails` to a first-class,
round-tripped recipe field and stops dropping it in both hydrators.

## What we did

- **`packages/form-builder/src/types.ts`** — added `contactDetails?: ContactDetails`
  to `RecipeDraft` (imported from `@govtech-bb/form-types`).
- **`packages/form-builder/src/serialization.ts`** — `serializeRecipeDraft` and
  `deserializeRecipe` carry `contactDetails` with the `!== undefined` guard
  (mirrors `processors`). This is the silent-drop regression fix.
- **`packages/form-builder/src/resolution.ts`** — builder preview `hydrateForm`
  carries `contactDetails` (guarded spread).
- **`apps/api/src/registry/resolution.ts`** — prod serving `hydrateForm` carries
  `contactDetails`. This is the dead-feature fix: without it, even seeded details
  never reached citizens.
- **`apps/form_builder/.../-recipe-reducer.ts`** — `UPDATE_CONTACT_DETAILS`
  action + case; `undefined` collapses the key back to absent.
- **`apps/form_builder/.../-contact-details-editor.tsx`** (new) — validates
  against `contactDetailsSchema` on an explicit Save before dispatch; address is
  one all-or-nothing optional group.
- **`apps/form_builder/.../index.tsx`** — `"contactDetails"` main-view, handler,
  render; **`-step-list.tsx`** — sidebar row directly above Processors.
- **Tests** — serialization round-trip (incl. address / no-address / absent /
  schema-parse), both hydrators, reducer (set/replace/clear), editor render +
  validation (invalid email, required fields, partial-address rejection, clear).

## Why we did it that way

- **Modelled on processors, not a toolbar field.** Contact details is a small
  structured object with a nested address — too big for the toolbar next to
  formId/title, and the form-scoped "main view + sidebar row" pattern already
  existed for processors. Reusing it meant no new UI paradigm.
- **Explicit Save, not dispatch-per-keystroke.** Unlike the processor config
  forms (which dispatch on every change), the editor holds local state and only
  commits on Save after `contactDetailsSchema.safeParse` succeeds — so a
  half-typed address can never be persisted mid-edit.
- **Address is all-or-nothing.** If every address field is blank, the group is
  omitted; if any is filled, `line1`/`city` are submitted blank-or-not so the
  schema enforces them. A partial address fails validation rather than silently
  saving a half-address (confirmed as the desired UX with Isaiah).
- **`!== undefined` guard, not truthiness.** Keeps "absent" distinct from a set
  value, the same reason processors uses it; a truthiness check would reintroduce
  the data-loss bug. No editor-only `id` to mint (single object, not a list).
- **Captured the recurring trap as ADR 0021.** This is the second time a recipe
  field was added to the schema but dropped in transit (after #255 processors);
  the ADR pins the four carry points + round-trip-test requirement so a third
  recurrence is a review/CI catch, not a dead feature.

## What we almost got wrong

- **The router-core dependency bug looked fixable here; it wasn't — reverted.**
  The form_builder dev server crashed in the browser with
  `does not provide an export named 'isInlinableStylesheet'`. Root cause: the
  `sandbox` lockfile hoists `@tanstack/router-core@1.171.7`, but form_builder's
  `react-router@1.170.6` depends on **exactly** `1.171.4` (which has that
  export); Vite's optimizer dedupes onto the hoisted 1.171.7. We first tried a
  pnpm override pinning router-core to 1.171.4 — which fixed the dev server but
  **broke `chat` and `forms` builds in CI**, because `chat`'s
  `react-router@1.170.9` needs `1.171.7`'s `DEV_STYLES_ATTR` export (gone in
  1.171.4). No single router-core version satisfies both react-router patches, so
  a global override is the wrong tool. The override was reverted; this PR is
  purely the #452 feature. The form_builder-dev-on-sandbox issue is pre-existing
  and deferred — the proper fix is bumping form_builder's `react-router` to
  1.170.9 (+ `react-start` to 1.168.16) to cohere with the rest of the monorepo
  on router-core 1.171.7, as its own change with full build+test.
  **Lesson: re-run the full `nx run-many -t build` after any dependency change,
  not just before** — the override was added after the build gate, so CI caught
  what the local check didn't.
- **`tsc -b apps/form_builder` reports 5 errors — pre-existing, not ours.**
  TanStack `ServerFn` serialization-type errors in `app/server/ai-builder/sessions.ts`,
  `app/server/registry.ts`, `app/routes/builder/ai/index.tsx` — none touched by
  #452. Confirmed pre-existing by stashing the deps changes and re-running on
  base sandbox deps (same 5 errors). The real CI gate is `pnpm exec tsc -b` from
  the repo root, which does **not** include form_builder and is clean. (The #442
  summary flags the same trap.)

## Open questions

None. Merge target (`sandbox`), address UX (all-or-nothing), and the router-core
fix disposition (fold in) were all settled with Isaiah during the session.
