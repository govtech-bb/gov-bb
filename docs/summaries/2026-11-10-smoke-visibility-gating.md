# Smoke: visibility gating on api_v2 pages (#3143)

## Context

The post-deploy landing smoke (#3305: `apps/landing/e2e/smoke/`, run by
`landing-v2-smoke.yml` on `v2-rewrite`) already proved api_v2 pages are
served from api_v2 (#3140) and that their Start links open forms (#3144). It
did not prove the public is kept out: preview pages, and forms under
maintenance, `form_disabled` or closed.

## What we did

- `api-v2-smoke.ts`: `previewPageUrls`, `gatedForms`, `gatedPages`, and a
  required `SMOKE_FORMS_API_URL`, all unit-tested with an injected fetch.
- `visibility.ts`: the browser checks. `visibility.live.pw.ts` runs one test
  per state, and `visibility.selftest.pw.ts` proves each check fails on an
  ungated page.
- Workflow: `SMOKE_FORMS_API_URL` job-wide, and the preview token on the live
  step only, taken from the existing `RECIPE_PREVIEW_TOKEN` secret.

## Why we did it that way

- **Discovery, not pinned fixture pages.** A deleted fixture also 404s, so a
  pinned "preview page returns 404" check passes vacuously, and someone has to
  keep the fixture alive in shared sandbox data. Instead, preview pages are
  the token catalog minus the anonymous one, and gated pages are catalog pages
  (plus `/start` siblings) whose `form_id` is on the forms API's lists. The
  cost: a state with no live example skips, so today's sandbox only runs
  maintenance and closed. Status-disabled skips because all six `form_disabled`
  forms are also under maintenance.
- **A wrong token fails, a missing one skips.** A 401 from the catalog throws,
  so a mis-set secret can't pass as "no preview pages".
- **Each page is classified by its own `form_id`.** Landing 404s a `/start`
  step when that page's own `form_id` is unavailable (`$.tsx`), not the
  parent's. A `/start` page with no `form_id` is never gated, so the smoke
  doesn't expect it to be.
- **DOM checks, not HTML grep.** The SSR HTML carries the page markdown,
  `data-start-link` included, escaped for hydration. Only the rendered `main`
  shows whether a Start link actually reached the citizen.
- **Selftest uses local `node:http` servers, not `page.route`** (the plan said
  `page.route`). The `/start` and preview checks use `page.request`, which
  `page.route` doesn't intercept, and `start-now.selftest.pw.ts` already
  set the pattern.
- **`RECIPE_PREVIEW_TOKEN` instead of a new secret.** The user's call, to reuse
  the shared preview secret for now.
- **`visibility.ts` is a separate module** so the selftest can import the
  checks without also registering the live tests.

## Open questions

- Nobody has confirmed that `RECIPE_PREVIEW_TOKEN` equals sandbox api_v2's
  `PREVIEW_SECRET`. If it doesn't, the preview test fails in CI with a 401.
  An unset token fails in CI too (it skips only locally), so a renamed secret
  can't turn the check off quietly.
- Draft pages aren't checked. #3247 drops only landing's `?draft=` viewer
  level; the 10 `draft` pages remain in api_v2. But api_v2 serves drafts only
  to an editor session, so the smoke has no token-based way to list them, and
  a pinned list would pass vacuously once a page is deleted.
- The catalog leaves out `/start` steps, so a page that is preview-only at
  `/start` isn't discovered.
- `gatedPages` makes about 100 sequential api_v2 reads (~15s). That's fine
  for now.
