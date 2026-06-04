# Fix: Start now buttons on youth-and-community pages (#497)

**Date:** 2026-06-02
**Issue:** [#497](https://github.com/govtech-bb/gov-bb/issues/497)

## What changed

Added `form_id` frontmatter and a `<a data-start-link>Start now</a>` anchor to 12
`youth-and-community/**` service pages, replacing each page's commented-out
`<!-- [Apply now] -->` placeholder. The existing "Go to the official site"
external link was kept on every page. No code changed — content only.

Pages: `byac`, `bridge-to-future-2025`, `bright-sparks-2`, `pathways`, `btu`,
`cap`, `cip`, `cmc`, `ceep`, `centre-access`, `barbados-blooming-libraries`,
`community-canvas`.

## Why

QA reported Start links across the landing site were broken or missing. #497's
original theory was "`VITE_FORMS_URL`/`VITE_FORMS_API_URL` unset/misconfigured."

An audit ruled that theory out. The Amplify env vars were checked directly for
both sandbox and staging and verified to resolve live (HTTP 200, valid
`/form-definitions`); staging's API host uses a different naming convention
(`api.staging…` not `forms.api.staging…`) but the configured value is correct,
not a typo. Config was not the cause.

Cross-referencing every page's `form_id` against the live sandbox manifest (51
forms) split the real causes into three buckets:

1. **Build freshness** — `get-death-certificate`, `post-office-redirection-business`,
   `post-office-redirection-deceased` are live but the deployed build-time
   manifest predates them (the manifest only refreshes when landing rebuilds, and
   nx can serve a cached build because the forms API is not an nx input). Fixed by
   a clean redeploy, handled on the deploy side.
2. **Authoring** — the 12 youth pages above had a matching live form but no
   `form_id`, so no button rendered. This is what the change fixes.
3. **Publication** — `post-office-redirection-individual` is not published in
   sandbox, and `get-marriage-certificate` is published as
   `get-marriage-certificate-test` (name mismatch). Both are forms-team
   follow-ups, not repo changes.

The render contract (ADR-0005) requires **both** a `form_id` in frontmatter and a
`<a data-start-link>` marker in the body; the youth pages had neither, so the fix
adds both.

## Decisions

- **Authored only confidently-mapped pages.** 12 of the 20 youth pages have an
  unambiguous live form (exact `youth-opportunity-<slug>` match, or pathways).
  `ydp` was left unwired — the only live YDP form is specifically
  *performing-arts registration* while the page is the broader programme, so it
  needs content confirmation. The other 7 pages have no matching Alpha form and
  stay external-only. Forcing a `form_id` on an unmatched page would reproduce
  the silent-suppression failure mode #497 is about.
- **Kept both CTAs.** Per product decision, the new in-Alpha Start button and the
  pre-existing "official site" external link coexist rather than replacing it.
- **Left `service_type: information` unchanged.** The pages now carry a
  transactional button but the taxonomy field was out of scope for this change.

## Tests

`nx run landing:build` and `nx run landing:test` (91 tests) green. All 12
`form_id`s confirmed present in the freshly-fetched manifest. The generated
`available-forms.gen.ts` is gitignored, so it is absent from the diff.

## Follow-ups

- `ydp` form mapping — confirm with content.
- `national-summer-camp` youth page may duplicate `register-summer-camp`.
- Forms team: publish `post-office-redirection-individual`; rename
  `get-marriage-certificate-test` → `get-marriage-certificate`.
