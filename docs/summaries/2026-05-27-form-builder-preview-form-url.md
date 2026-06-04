# Form-builder "Preview form" links via `VITE_FORMS_URL`

**Date:** 2026-05-27
**Branch:** `feat/form-builder-preview-form-url` → merges into `sandbox`
**Commit:** `d71cd84`

## Context

The AI builder (`/builder/ai`) showed a "Preview form" link after publishing,
but the URL was built **server-side in `form_builder_api`** and hardcoded to
`https://forms.sandbox.alpha.gov.bb/forms/${formId}` — wrong for local dev and
any non-sandbox environment. The UI builder (`/builder/ui`) had no live-form
link at all (its "Preview" button opens an in-app contract modal). The ask:
both surfaces should link to `${forms-app-origin}/forms/{formId}`, with the
origin coming from an env var documented in `.env.example`.

## What we did

- Added `app/lib/form-url.ts` — `joinFormPreviewUrl(origin, id)` (pure) +
  `formPreviewUrl(id)` (reads the origin from config). Unit-tested.
- AI surface: build the link from the origin + the `formId` the publish API
  already returns, instead of consuming the backend's hardcoded `previewUrl`.
- UI surface: render the same "🔗 Preview form" link in the `SubmitModal`
  success state after a save (additive; the modal and confirmation are
  untouched). Component-tested.
- `jest.config.ts`: added the `ts-jest-mock-import-meta` transformer (see why
  below).

## Why we did it that way

- **Frontend, not backend.** The user's scope was `apps/form_builder` only.
  The API already returns `formId`, so the frontend can build the URL itself;
  this leaves `form_builder_api`'s now-redundant `previewUrl` alone (flagged
  in a comment on `PublishResponse.previewUrl`). Chosen over editing the API
  to read the env var, which would have widened the blast radius.
- **`VITE_FORMS_URL`, read via `import.meta.env` — not `FORM_URL` via a vite
  `define`.** The first implementation used `process.env.FORM_URL` baked into
  the bundle with a `define` block (mirroring `form_builder`'s existing
  `BUILDER_API_URL` etc.). That was **wrong**: those existing vars are only
  read in *server* entries, whereas the preview helper is bundled into the
  *browser*. [ADR-0005](../decisions/0005-vite-env-vars-use-import-meta-env-only.md)
  explicitly forbids `process.env`/`define` for browser-readable config in
  `apps/form_builder` and mandates `VITE_`-prefixed vars via `import.meta.env`.
  We renamed to `VITE_FORMS_URL` — the exact var the landing app already uses
  for forms links ([ADR-0004](../decisions/0004-form-scheme-for-cross-app-links.md))
  — so the monorepo has one name for "the forms origin." The user picked this
  over keeping `FORM_URL` (which would have required a superseding ADR).
- **The jest wrinkle.** `form_builder` runs ts-jest in CJS mode, where
  `import.meta` is a hard syntax error (TS1343) raised *before* the
  `ts-jest-mock-import-meta` AST transformer rewrites it. `apps/forms` sidesteps
  this with a blanket `diagnostics: false`, but `form_builder` is `noEmit` and
  not in the `tsc -b` graph, so ts-jest during `nx test` is its **only**
  type-check in CI. To keep that, we suppressed *only* `diagnostics.ignoreCodes:
  [1343]` rather than disabling diagnostics wholesale.
- **Dev default `http://localhost:3000`.** The forms app's dev server runs on
  `:3000` (`apps/forms/package.json`). The helper falls back to it when
  `VITE_FORMS_URL` is unset; `.env.example` documents the same value.

## What we almost got wrong

The whole thing initially shipped (uncommitted) using `process.env` + `define`,
which silently violated ADR-0005 — caught only while scanning existing decision
records during the dev-finish wrap, not during the build. Lesson: check
`docs/decisions/` for the area you're touching *before* implementing, not after.

Separately, the worktree was deleted mid-wrap before anything was committed, so
the first implementation was lost and rebuilt from the conversation record (in
the corrected `VITE_FORMS_URL` form). The rebuild was committed immediately.

## Open questions

- `form_builder_api` still returns the hardcoded sandbox `previewUrl`; it's now
  dead from the frontend's perspective. Cleaning it up (and the `previewUrl?`
  field) is a separate `form_builder_api` change, deliberately out of scope here.
