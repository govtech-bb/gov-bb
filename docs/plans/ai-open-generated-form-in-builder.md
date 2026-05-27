# Form Builder AI — Open generated form directly in the UI builder

**Date:** 2026-05-27
**Issue:** [#235 — Form Builder AI: open generated form directly in the Form UI builder](https://github.com/govtech-bb/gov-bb/issues/235)
**Area:** `apps/form_builder`

---

## Goal

After the Form Builder AI generates a form, give the user a one-click **"Open in
builder"** action that publishes the form and opens it directly in the Form UI
builder (`/builder/ui`), ready to edit — removing the current "navigate to the UI
builder separately, then open the form manually" detour.

---

## Approach

**Publish first, then open by `formId`.** The new button persists the generated
recipe via the existing AI publish flow, then navigates to the UI builder pointed
at that `formId`. The UI builder loads it through the same path the **Open** form
picker already uses.

All the machinery already exists; the only gap is wiring it together:

- AI publish (`publishSession`) persists the recipe to `form_definitions` and
  returns the `formId`. It is idempotent within a session — if a form was already
  published this session, it deletes the prior row and re-inserts, so clicking
  "Open in builder" after a manual "Publish" just replaces cleanly.
- The UI builder already turns a stored recipe into an editable draft:
  `getRecipe({ formId })` → `deserializeRecipe(recipe, catalog)` → `handleLoad(...)`
  (this is exactly what `-form-picker.tsx` does). `GET /builder/forms/:formId`
  reads the same `FormDefinitionEntity` that AI-publish writes, so a just-published
  form is immediately retrievable.

**Considered alternatives:**

- *Carry the in-progress recipe client-side (sessionStorage / router state), no
  publish.* Lighter and works before publishing, but rejected per the chosen
  behaviour: "open in builder" should open a created (persisted) form, and
  reusing the existing publish + open-by-`formId` path means **no new server
  functions and no second recipe→draft code path**.
- *Make the existing "Switch to UI Builder" button carry the recipe.* Rejected —
  keep that button's discard-and-navigate behaviour; add a distinct action so the
  two intents stay separate.
- *Handoff via router history state instead of a search param.* Rejected — a
  `?formId=` search param is refresh-safe and shareable.

---

## Scope

1. **AI page — "Open in builder" button.** New button in the Recipe Output header
   (alongside Extract / Export SQL / Publish), enabled only when `session.recipe`
   exists. On click: publish via `publishSession({ sessionId })`, read `formId`
   from the response, show an "Opening…" state, then navigate to
   `/builder/ui?formId=<formId>`. On publish failure, surface the error in the
   existing `publishResult` area and **do not** navigate.

2. **UI builder — auto-open by `formId`.** Add `formId` to the route's search
   schema. A one-shot effect on mount: when `search.formId` is present, fetch via
   the existing `getRecipe({ formId })`, `deserializeRecipe(recipe, catalog)`, then
   call the existing `handleLoad(draft, formId, recipe.version)`. Because
   `handleLoad` sets `loadedFromId`, the form opens as "loaded from DB" — a
   same-version save does `updateRecipe` (edit in place), which is correct for a
   form just created.

3. **Clear the param after load.** Once loaded, strip `formId` from the URL
   (replace navigation) so a refresh doesn't re-trigger the load or clobber edits.

**Out of scope:**

- Carrying an *unpublished* in-progress recipe into the builder (rejected above).
- Any change to the existing "Switch to UI Builder" button.
- Any new API endpoints or server functions — `publishSession` and `getRecipe`
  already cover this.

---

## Files

**Modify:**

- `apps/form_builder/app/routes/builder/ai/index.tsx`
  - Add `handleOpenInBuilder`: set an `opening` state, `await publishSession({ data: { sessionId } })`, then `navigate({ to: "/builder/ui", search: { formId: data.formId } })`. On error, write to `publishResult` and stay put.
  - Add the **Open in builder** button to the Recipe Output header, disabled unless `session.recipe` (and not while `opening`).

- `apps/form_builder/app/routes/builder/ui/index.tsx`
  - Add `validateSearch` to the route for `{ formId?: string }`.
  - Add a one-shot mount effect (guarded by a ref so it runs once): if `formId` is set, `getRecipe({ data: { formId } })` → `deserializeRecipe(recipe, catalog)` → `handleLoad(draft, formId, recipe.version)`, then `navigate({ search: {}, replace: true })` to drop the param.
  - Handle the not-found / load-error case with a visible message (reuse the existing error surface rather than failing silently).

No changes expected in `apps/form_builder_api` or the shared packages.

---

## Verify

- `pnpm exec nx run-many -t build` and `pnpm exec nx run-many -t test` stay green
  (form-builder-app uses jest: `nx test form-builder-app`).
- **Real-browser smoke test** (preferred over Playwright for this navigation flow):
  1. In `/builder/ai`, generate a form (or upload a PDF) until a recipe appears.
  2. Click **Open in builder**.
  3. Confirm it lands on `/builder/ui` with the form's steps/fields loaded and
     editable, the `formId`/version populated in the toolbar, and the URL cleaned
     of `?formId=`.
  4. Edit a field and Save — confirm it updates in place (no duplicate form).
  5. Re-run from a session where "Publish" was already clicked — confirm
     "Open in builder" still works (re-publish replaces, no error).

---

## Open questions

- Button label/placement is assumed as **"Open in builder"** in the Recipe Output
  header. If you'd rather it sit next to "Switch to UI Builder" in the chat header,
  that's a trivial move.
- Should the UI builder show a small toast/heading like "Opened from AI" on arrival,
  or land silently? Defaulting to silent unless you want the cue.
