# Form builder picker shows preview/draft/maintenance forms with no DB draft

**Date:** 2026-07-02
**Branch:** `1835-form-builder-picker-nonpublic-visibility` → merges into `sandbox`
**Issue:** [#1835](https://github.com/govtech-bb/gov-bb/issues/1835) — picker can't see non-public forms without a DB draft; no UI path to un-hide them

## What

A published form whose visibility is `preview`/`draft`/`maintenance` now appears
in the builder's **Open Form** picker even after its DB draft row is archived
(the normal post-publish steady state), badged with its visibility, so an
operator can open it and flip it back to `public`. Previously such a form
vanished entirely — no UI home.

The mechanism is the existing recipe-preview token, extended from the
single-form GET to the list:

- **packages/form-types** (`form-summary.type.ts`) — optional
  `visibility?: RecipeVisibility` added to both `PublicFormSummary` and
  `BuilderFormSummary` (additive; imported intra-package from
  `service-contract.type.ts`).
- **apps/api** — `RecipeFileLoaderService.findAll(includeNonPublic)` and
  `FormDefinitionsService.findAll(includeNonPublic)` / `findAllFromDb(...)` keep
  non-public recipes and stamp each entry's `visibility` **only** when the flag
  is set. `FormDefinitionsController.getAll` reads `x-recipe-preview`, validates
  it against `RECIPE_PREVIEW_TOKEN` via the shared constant-time
  `isValidSecretToken`, passes `includeNonPublic`, and sets
  `Cache-Control: no-store` on the token path.
- **apps/form_builder_api** — `fetchPublishedForms` forwards
  `x-recipe-preview: <RECIPE_PREVIEW_TOKEN>` when the env var is set;
  `RECIPE_PREVIEW_TOKEN` added to `config/env.ts` as **optional** everywhere;
  `PublishedForm` picks up `visibility`.
- **apps/form_builder** — `listForms` carries `visibility` through the
  draft-vs-published merge via a `visibilityByFormId` map; `-form-picker.tsx`
  renders a `visibilityBadge` for non-public forms.

## Why

The picker's two data sources both hid these forms: `/builder/forms` returns a
form only when a `form_definitions` DB row exists (deleted on the post-merge
archive), and `/builder/forms/published` proxies apps/api's **public** index,
which strips non-public recipes. So a published non-public form with no draft
fell through both — the same "needs prod/DB access to recover" trap as the
disabled-form and `isPublished` gaps.

- **Reuse the preview-token contract, don't invent a new primitive.** #1646/#1682
  already made a valid `x-recipe-preview` token bypass the visibility gate on the
  single-form GET. Extending the *same* token to the list is the symmetric
  completion — one visibility-bypass path to keep in sync, not two. A dedicated
  `/form-definitions/authoring` endpoint was rejected as more wiring and a second
  path; merging `/form-definitions/maintenance` was rejected (covers only
  `maintenance`, no title/version); listing from GitHub was rejected (the slow
  ~1400-call path the proxy exists to avoid).
- **Backward-compatible by construction.** With no token the response is
  byte-for-byte unchanged: `includeNonPublic` defaults `false`, non-public
  recipes stay filtered, and `visibility` is spread in only under
  `...(includeNonPublic && { visibility })` so the field is *absent* (not
  `undefined`-valued) on the default path. The shared-sandbox forms smoke sends
  no token, so it's unaffected.
- **Fail-open, never a boot crash (the #1627 lesson).** `RECIPE_PREVIEW_TOKEN` is
  optional in form_builder_api and deliberately **not** in the prod `superRefine`
  guard. Unset → the proxy omits the header and takes today's public-only list
  (degraded), rather than crash-looping ECS.
- **Header-only for the list, no cookie.** The single-form GET also honors the
  shared `preview` cookie, but the proxy call is server-to-server and has no
  cookie, so the list path carries the token only via the header (resolved the
  plan's open question).
- **`isPublished` now means "present in the committed recipe set (any
  visibility)".** A non-public published form is now in the authoring index, so
  `isPublished` is true for it — which is correct for the picker's action
  buttons: it gets Disable/Erase (a committed recipe), not draft-Delete. The new
  visibility badge is what conveys true public reachability.

## Notes

- **Shared `fetchPublishedForms` widens the uniqueness backstop too.** Forwarding
  the token lives in the function shared by the proxy *and* the write-path
  formId-uniqueness check, so that check now also sees non-public published forms
  when the token is set. Intended and more correct (a hidden published formId is
  still taken) — confirmed with the user before building.
- **Badge color is theme-stable.** `.visibilityBadge` pairs `--el-800`
  (background) with `--el-150` (text). Both invert together across light/dark, so
  contrast holds — a first cut used hardcoded `white` on `--el-800`, which reads
  white-on-light-gray in dark mode (the documented #1739 trap); the code review
  caught it.
- **Opening the form was already wired.** `resolveStoredRecipe` falls back to the
  published flat file when there's no draft row, so a non-public form opens and
  its `meta.visibility` populates the builder's control — this change only makes
  it *reachable* in the picker.
- Verified: `nx run-many -t build --exclude=landing` (17 projects), `tsc -b`
  clean (0 errors), and tests for form-types (431) / api (937) / form-builder-api
  (260) / form-builder-app (666) all pass. `form-builder-app:test` failed only
  under `run-many` (the known Vite-teardown flake, nx-flagged) and passed in
  isolation. Independent code-review subagent: Go, 0 correctness/security issues.

## Open questions

None. Manual browser smoke (publish → set `maintenance` → confirm badge in
picker → open → flip to `public`) is pending, to be run by the user.
