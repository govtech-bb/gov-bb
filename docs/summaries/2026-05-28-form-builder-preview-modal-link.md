# form_builder: live preview link in the preview modal

## Context

Branch `form-builder/preview-modal-link` (merges into `sandbox`).

The builder already surfaced a `🔗 Preview form` link, but only in the **submit
modal**, and only *after* a successful submit — because that link
(`formPreviewUrl(formId)` → `/forms/<id>?preview=demo`) is resolved by the forms
app fetching the recipe **by id from the DB**. Isaiah's complaint: you shouldn't
have to save a whole draft just to get a preview link.

The **preview modal** is a different beast — it POSTs the in-memory recipe to
`/builder/registry/preview`, gets back a compiled `ServiceContract`, and renders
a static structural summary (id, title, steps/fields). Nothing is persisted.

## What we did

- **`app/routes/builder/ui/-preview-modal.tsx`** — new optional
  `previewUrl?: string | null` prop. When set, the modal renders a
  `🔗 Preview saved form` link (`target=_blank`, `rel=noopener noreferrer`);
  when `null`, it shows the hint "Save this recipe to enable a live preview
  link." JSDoc documents the last-saved-vs-in-memory caveat.
- **`app/routes/builder/ui/index.tsx`** — imports `formPreviewUrl` and passes
  `previewUrl={loadedFromId ? formPreviewUrl(loadedFromId) : null}`. Reuses the
  exact `?preview=<token>` helper the submit modal already uses.
- **`app/routes/builder/ui/-preview-modal.spec.tsx`** — new jsdom spec (TDD):
  link-with-href when saved; hint-and-no-link when unsaved.

## Why we did it that way

- **Gate on `loadedFromId`, link only when saved.** The forms-app preview link
  resolves a recipe *by id from the DB*; an unsaved/in-memory recipe has nothing
  to resolve and would 404. Two alternatives were put to Isaiah at dev-start:
  (a) an ephemeral server-side preview store so unsaved recipes resolve, and
  (b) auto-saving a draft on preview. He chose **link-only-when-saved** — the
  cheapest option, no new backend infra, no surprise persistence. The practical
  win: when editing an *existing* (already-saved) form, the preview link is now
  available straight from the preview modal with **no re-submit** — which is the
  friction he was actually hitting. A brand-new never-saved recipe still has to
  be saved once; the hint tells you so.
- **`loadedFromId`, not `draft.formId`, as the id.** `loadedFromId` is the id
  the recipe was loaded from (set on load *and* after submit) — i.e. the id that
  genuinely exists in the DB. `draft.formId` can be edited in the form, which
  would point the link at a non-existent record.
- **Link text "Preview saved form", not "Preview form".** The inline modal shows
  your *current* edits, but the forms-app link resolves the *last-saved* DB
  version — these can diverge. The wording (Isaiah's call) keeps that honest so
  the link isn't read as previewing unsaved edits.

## What we almost got wrong / notes

- No ADR written. "Link only when saved" is a scoped UX decision for one modal,
  not a codebase-wide principle — below the decision-record bar. The
  forms-app-preview-needs-a-DB-record reality is already captured by
  ADR-0011-unpublished-recipe-preview and the preview-token-link work.
- `tsc -b apps/form_builder` reports two errors in `app/server/registry.ts`
  (TanStack server-fn serialization typing) — confirmed **pre-existing on base
  `sandbox`**, untouched by this change. `form_builder`'s real type-check is via
  ts-jest diagnostics, which passed.

## Open questions

- **Manual browser smoke pending (Isaiah).** Load an existing form → open
  Preview → confirm the `Preview saved form` link appears and opens the live
  forms preview; then a fresh recipe → confirm the save-first hint shows.
