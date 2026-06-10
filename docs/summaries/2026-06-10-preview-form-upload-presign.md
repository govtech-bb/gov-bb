# Preview-form file uploads — presign/confirm honour the preview token (#1082)

## Context

File uploads failed at the **presign** step for any preview form that hadn't
been published yet
([#1082](https://github.com/govtech-bb/gov-bb/issues/1082)). The citizen-facing
UI showed *"File upload failed (presign). Please try again."* for every
undeployed preview form, and started working the moment the recipe was
published.

Root cause: a preview form (opened via `?preview=<token>` from the builder)
lives only in the `form_definitions` DB table. The form *renders* because the
form-GET endpoint forwards the `x-recipe-preview` token and resolves with
`preview: true` — but `/files/presign-upload` and `/files/confirm-upload` never
received or honoured that token, so they resolved against published recipes
only, missed the draft, and returned `400 "Form not found"`.

Resolved on `1082-preview-upload-presign` (targets `sandbox`).

## What we did

Threaded the preview token through the upload path, mirroring the proven
form-GET pattern (`form-definitions.controller.ts` reads
`@Headers("x-recipe-preview")`, validates via `isValidPreviewToken`, passes a
`preview` boolean into `findByFormId`).

- **API** (`apps/api`):
  - `files.controller.ts` — reads `@Headers("x-recipe-preview")` on both
    `presign-upload` and `confirm-upload`, forwards it to the service.
  - `files.service.ts` — `presignUpload`/`confirmUpload` accept an optional
    token; a new private `isPreview()` validates it against
    `RECIPE_PREVIEW_TOKEN` via the shared `isValidPreviewToken`; `resolveFileField`
    takes a `preview` flag and threads it into `findByFormId`.
- **Forms** (`apps/forms`):
  - `lib/api/files.ts` — the token rides as the `X-Recipe-Preview` **header**,
    set on presign + confirm only when present.
  - Threaded `previewToken` from the route → `FormRenderer` → `FieldRenderer` →
    `FileUpload` → `uploadFile`; added the prop to `FileUploadProps` and
    `FormRendererProps`.
- **Tests** on both sides: API service (DB-only draft presignable/confirmable
  only with a valid token; missing/invalid still 400s), API controller (header
  forwarding), forms client (header set/omitted), and `FileUpload` prop
  forwarding.

## Why we did it that way

- **Token in the header, never the body.** The API runs
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, so adding a
  `previewToken` field to the presign/confirm DTO body would be rejected with a
  422/400. Routing it through `@Headers("x-recipe-preview")` — exactly as the
  form-GET path does — sidesteps body validation entirely and keeps the request
  shape unchanged.
- **Validate, don't trust presence.** `preview: true` is honoured only when the
  token matches the configured `RECIPE_PREVIEW_TOKEN` (constant-time,
  fail-closed). A missing/invalid token leaves behaviour identical to before
  (published recipes only), so the change is additive and backward-compatible
  against the **shared sandbox API** the per-PR preview smoke gate posts to — no
  expand/contract risk.
- **Threaded the raw token, not just `isPreview`.** `FormRenderer` already
  received an `isPreview` boolean, but the upload client needs the actual token
  string to set the header, so a separate `previewToken` prop was added
  alongside it.
- **Fixed the inset-field call sites too.** The two nested `FieldRenderer` calls
  (fields revealed under a conditional radio/select option) previously forwarded
  only `formId` — not `formVersion` — so an inset *file* field would already
  presign with an empty version, independent of preview. Adding `formVersion` +
  `previewToken` to both brings them in line with the top-level call sites; the
  props are inert for non-file fields.

## Out of scope / follow-up

- **#284 (presign/confirm are unauthenticated).** Real endpoint auth remains the
  home for that work. The preview-token gating added here is a *partial
  mitigation* (keeps undeployed drafts from being uploadable without the token),
  not a replacement — cross-referenced, fixed separately.
- **Manual smoke** (upload a file on an unpublished preview form, reach review)
  to be performed in a real browser before merge.
