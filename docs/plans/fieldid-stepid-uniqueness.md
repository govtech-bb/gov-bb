# form_builder: validate fieldId/stepId uniqueness within a recipe

Issue: [#206](https://github.com/govtech-bb/gov-bb/issues/206) (follow-up to
[#201](https://github.com/govtech-bb/gov-bb/issues/201), which added kebab-case
*format* validation but explicitly deferred *uniqueness*.)

## Goal

In the form builder, two fields must never resolve to the same data `fieldId`,
and two steps must never share a `stepId`, within one recipe. When a collision
exists the author sees it surfaced (an always-on banner + the Validate panel +
inline feedback at the point of edit), and **cannot Save draft or Deploy** until
it's resolved. This closes the silent-duplicate path that breaks downstream
field/step references in validation rules, behaviours, and the forms renderer.

Scope is **client-only** in the form_builder app this issue. A server-side /
API backstop (to also guard AI-builder output and any future ingest) is a
deliberate follow-up — see Open questions.

## Approach

### Why this can't just validate the override input

A field's **effective data id** is `overrides.fieldId ?? primitive.fieldId` —
and every component ships a default `fieldId` baked into the catalog
(`components/text` → `"text"`, `components/email` → `"email"`, …). Blocks expand
to several child ids (`blocks/name` → `first-name`, `last-name`), each
overridable via `childOverrides[childFieldId].fieldId`.

The consequence: **the most common collision needs no typing at all.** Drop two
Text fields on a step and both resolve to `text` with blank overrides — already
a duplicate. So a check that only inspects what the user types into the Field ID
Override box (the way #201 handled *format*) would miss the dominant collision
path. The uniqueness check has to operate on **resolved** ids across the whole
recipe.

Scope is **recipe-wide, not per-step** — form submission data is one flat object
keyed by `fieldId` across all steps, so an id must be unique across the entire
form. This matches the AI-builder system prompt's existing "Rule 1: EVERY
element MUST have a unique fieldId override … unique across the entire form."

### The mechanism

1. **A pure detector in `packages/form-builder`** resolves every field's
   effective id across all steps and returns the collisions. This is the single
   source of truth; the UI consumes it three ways.

2. **Live gate via `canSubmit`.** `index.tsx` already gates *both* the "Save
   draft" and "Deploy via GitHub" buttons on
   `canSubmit = validateResult?.valid === true && …`. We add a live `useMemo`
   over the draft and fold "no duplicates" into `canSubmit`. Doing it as a live
   derived value (not only inside `handleValidate`) matters because
   `validateResult` is **not** reset when the draft is edited today — a
   stale-green result would otherwise leave the buttons enabled after a dup is
   introduced. Blocking both buttons is consistent with how an empty step
   already blocks both (decided: block both, not Deploy-only).

3. **Always-on banner + Validate panel.** Render a banner near the existing
   `ValidationPanel` whenever the live detector finds collisions (so the
   no-typing default-collision case is visible immediately, without a Validate
   click), and also inject the collisions as issues into `handleValidate`'s
   result so they appear in the detailed panel.

4. **Inline warns for #201 consistency.** Step ID uniqueness in `-step-editor.tsx`
   (mirrors its existing format error), and the top-level Field ID Override in
   `-field-edit-panel.tsx`. Block-child collisions lean on the recipe-wide
   banner/gate rather than per-child inline — see the scope note below.

**Alternatives considered.**
- *Inline-only, mirror #201.* Rejected — silently misses two-defaults
  collisions (blank overrides), the most common case.
- *Server-side in `validateFormContract`.* Out of scope here. That function is a
  pure Zod parse with no catalog, so it can't resolve defaults; adding catalog
  resolution crosses the runtime-safe layering. Tracked as a follow-up.
- *Block-child inline warns.* Deferred — each block child edits via its own
  `OverrideForm` against **uncommitted** `childOverrides` local state; threading
  that into per-child inline checks is materially more plumbing for a case the
  recipe-wide banner/gate already covers.

## Scope

1. Add `findDuplicateFieldIds(draft, catalog)` and `findDuplicateStepIds(draft)`
   (or one combined `findRecipeIdCollisions`) to `packages/form-builder`, with a
   small result shape that names each duplicated id and the locations holding it
   (step + field display, so the banner can be specific). Export from
   `packages/form-builder/src/index.ts`.
2. Unit-test the detector alongside `resolution.spec.ts` /
   `serialization.spec.ts`.
3. `index.tsx`:
   - `const idCollisions = useMemo(() => …(draft, catalog), [draft, catalog])`.
   - Fold `idCollisions.length === 0` into `canSubmit` → gates Save draft + Deploy.
   - Render an always-on collision banner when `idCollisions` is non-empty.
   - In `handleValidate`, add a pre-flight that injects collisions as
     `ValidationIssue`s (same pattern as the existing empty-step pre-flight) so
     they show in `ValidationPanel`.
4. `-step-editor.tsx`: in `handleStepIdChange`, after the format check, reject a
   `stepId` that duplicates another step's id, surfacing the existing
   `stepIdError`-style inline message.
5. `-field-edit-panel.tsx`: in the top-level `OverrideForm`, add a live inline
   warning when the typed Field ID Override duplicates another field's resolved
   id. Thread the editing field's editor `id` + `draft` + `catalog` in so the
   check excludes self and resolves "all other ids".
6. Manual smoke in Isaiah's browser per [[feedback_user_smoke_tests]] — no
   Playwright.

## Files

**Add**
- `packages/form-builder/src/duplicate-ids.ts` — the pure detector(s).
- `packages/form-builder/src/duplicate-ids.spec.ts` — unit tests.

**Modify**
- `packages/form-builder/src/index.ts` — export the detector(s).
- `apps/form_builder/app/routes/builder/ui/index.tsx` — `useMemo`, `canSubmit`,
  banner, `handleValidate` pre-flight.
- `apps/form_builder/app/routes/builder/ui/-step-editor.tsx` — stepId uniqueness
  inline.
- `apps/form_builder/app/routes/builder/ui/-field-edit-panel.tsx` — top-level
  Field ID Override inline warning + thread editing-field context into
  `OverrideForm`.

## Verify

1. **Unit tests** — new `duplicate-ids.spec.ts` covers:
   - two same-component fields, both blank overrides → collision on the default id;
   - hand-typed override duplicating another field's id;
   - two blocks of the same ref → collision on each child id;
   - a block child id colliding with a top-level field id;
   - duplicate `stepId`s;
   - a clean recipe → no collisions;
   - custom components (default id read via the catalog item's primitive).
2. **Full build + tests** before commit per `CLAUDE.md` —
   `pnpm exec nx run-many -t build` and `pnpm exec nx run-many -t test`.
3. **Manual smoke** in Isaiah's browser:
   - Drop two Text fields on a step (no overrides) → collision banner appears,
     *Save draft* and *Deploy via GitHub* are disabled.
   - Override one to a unique id → banner clears, buttons re-enable.
   - Type an override on field B that duplicates field A's id → inline warning on
     B's Field ID Override + banner + buttons disabled.
   - Add two Name blocks → child-id collision (`first-name`/`last-name`) flagged
     in the banner/Validate panel.
   - Give two steps the same Step ID → inline error on the Step ID input.
   - Run Validate → collisions listed in `ValidationPanel`; resolve them →
     Validate goes green and buttons enable.

## Open questions

- **Server-side / API backstop** — filed as
  [#207](https://github.com/govtech-bb/gov-bb/issues/207). The AI-builder path's
  only current guard against dup ids is a prompt instruction; a shared
  form-builder detector wired into `/builder/registry/validate` would backstop
  AI output + any ingest. Out of scope here.
- **Custom component default id** — filed as
  [#208](https://github.com/govtech-bb/gov-bb/issues/208). The detector reads a
  component's default `fieldId` from the catalog item's primitive (a cast in
  `catalog.ts`); confirm custom components always carry a resolvable `fieldId` so
  they participate correctly, or handle a missing default defensively.
- **Block-child inline feedback.** Deferred to the recipe-wide banner/gate (see
  Approach). Revisit if authors want point-of-edit feedback inside block child
  forms.
