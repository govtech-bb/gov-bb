# Preview is view-only: stop the opaque submit-on-preview 404 (#934)

## Context

A form opened in preview mode (`?preview=<token>`) rendered fine but failed at
submit with a generic "Something went wrong" panel —
[#934](https://github.com/govtech-bb/gov-bb/issues/934). Root cause: the two
recipe paths resolve from different sources. `GET /form-definitions/:formId`
honours the preview token and serves the unpublished **DB** draft, but
`POST /submissions` resolves from bundled **file** recipes only (forced outside
`NODE_ENV=development` per ADR 0007 / #145). A draft-only version (the reported
case was `get-death-certificate` 1.2.2) isn't in files, so `findByFormId` threw
`AppError.notFound` → 404. Done on the `preview-view-only-934` worktree, targets
`sandbox`.

## What we did

- **Decided preview is view-only** (ADR 0043). The operator uses preview to
  confirm a draft renders and flows; running a real submission off an
  unpublished draft is deferred to a future test-submission harness.
- **Frontend (`apps/forms`) — primary fix.** Added optional `isPreview` to
  `FormRendererProps`; the route derives `isPreview = Boolean(search.preview)`
  and threads it in. `FormRenderer` shows a persistent `StatusBanner`
  (variant `service-issue`) on every step except submission-confirmation, and on
  the `declaration` step in preview disables + relabels Submit to
  "Submit (preview)" with an inline hint. Continue / Previous stay functional.
- **Backend (`apps/api`) — defense-in-depth.** `submission-pipeline`'s
  `pinVersion` now resolves through a new `resolveSubmittableContract` helper:
  on a `NotFoundException` from the files path it probes
  `getRecipe({ preview: true })` (DB-consulting); a DB hit → clear `400`
  ("unpublished preview — publish before submitting"), a genuine miss → the
  existing `404` is preserved.
- Tests: renderer (banner on/off, declaration disabled+relabelled+hint, no
  banner on confirmation), route (`isPreview` forwarded true/false), pipeline
  (DB-only → 400, unknown → 404, published file → unaffected, non-NotFound
  re-thrown).

## Why we did it that way

- **Frontend-first, backend as backstop.** A backend-only clear error would let
  the operator fill the whole form and only learn at the last step it was never
  submittable — wasted effort. Disabling Submit up front is the real UX; the 400
  exists for stale tabs, direct POSTs, API consumers, and logs, which the
  disabled button can't cover. The route already *knew* it was in preview
  (`search.preview` feeds `loaderDeps`); it just did nothing with it at submit
  time, so threading one flag was the whole frontend change.
- **Probe the DB to disambiguate, don't honour the token on submit.** Honouring
  the preview token symmetrically on `POST /submissions` would create real
  records/reference numbers/payments/emails off a draft — re-opening #145. The
  helper instead distinguishes "unpublished preview version" (DB hit → 400) from
  "genuinely unknown version" (miss → 404) without ever submitting against the
  draft. Catching only `NotFoundException` and re-throwing everything else keeps
  unrelated failures untouched. `getRecipe(preview:true)` forces the DB path
  regardless of `RECIPE_SOURCE`/`NODE_ENV`, so the probe works in production.
- **`isPreview` optional, defaulting false.** Keeps the ~30 existing renderer
  tests (which don't pass the prop) type-checking, and matches the existing
  optional `submissionState?` on the same props interface.
- **Reused `StatusBanner` from `@govtech-bb/react`** rather than hand-rolling a
  banner — it's an existing dependency with a `service-issue` warning variant.

## Open questions

- **Backend message not surfaced to users.** `onSubmit` in the route renders a
  generic "Something went wrong" panel regardless of the server message. Since
  Submit is disabled in preview, the 400 is defense-in-depth and its specific
  message does not need rendering for this change; threading it into the
  confirmation panel is an optional follow-up.
- **Real-browser smoke left to Isaiah** (per the "smoke in a real browser"
  preference): open a DB-only draft version with `?preview=<token>` → banner on
  the first step, Submit disabled on `declaration`.
