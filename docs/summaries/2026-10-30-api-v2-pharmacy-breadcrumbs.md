# api_v2: pin the pharmacy sub-pages' breadcrumbs (#3243)

## Context

#3243 (25 Oct) said landing ignored api_v2's `breadcrumbs` and labelled crumbs
from the static registry. By the time it was picked up (30 Oct) that was no
longer true: #3359 (28 Oct, "load categories from api_v2") had wired landing to
the API's trail, but it neither referenced nor closed #3243, so the issue
stayed open.

## What we did

- One case in `apps/api_v2/src/seed.test.ts`: seed the estate, resolve
  `/health-and-emergency-services/prescription-colours` and
  `/health-and-emergency-services/free-or-subsidised-medication` as `public`,
  and assert each trail is category → Find a pharmacy… → the page.
- No landing, editor_v2 or api_v2 source changes.

## Why we did it that way

- **A test rather than closing with no code.** Every "Done when" item was
  already covered in pieces (`app.test.ts` parent crumbs on synthetic data,
  `seed.test.ts` checking one pharmacy page's `parent` row, landing's
  preview-gating and JSON-LD tests). The one case the issue singles out — the
  pharmacy nesting — had no test that reads a seeded page's trail end to end.
- **In api_v2's seed test, not landing's render-parity test.** Landing can't
  compute api_v2's trail without re-implementing `pageCategory` +
  `ancestorsOf`; the seed test exercises the real resolution code against the
  real snapshot.
- **Titles read from `ESTATE`, not hardcoded.** `estate.json` is regenerated on
  every content refresh; a retitled page should not break a test about
  nesting. The trail's length and urls still pin the structure.
- **`PARENT_PATHS` stays.** It still drives the static site, the static
  fallback in api mode, the static JSON-LD path and the category listing
  exclusion. Removing it is #3165's job.

## Open questions

- The manual check — create a sub-page in editor_v2 on sandbox and see its
  parent's title in the `v2-rewrite` preview's breadcrumb — needs a deployed
  api_v2, which no CI job has. To be recorded on #3243's closing comment.
- Sandbox only shows the pharmacy nesting once an import carrying `parent`
  has run there (#3234).
