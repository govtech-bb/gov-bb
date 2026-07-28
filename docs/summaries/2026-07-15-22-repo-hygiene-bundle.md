# 2026-07-15 — #22: repo hygiene bundle (safe subset)

## Context

Issue #22 is a 7-item "repo posture" hygiene bundle (severity: low). Rather than
take it as-is, we checked each item against the current code and split it.
Plan: `docs/plans/repo-hygiene-bundle-22.md`. Branch off `main`.

## What we found before coding

- **Item 6 (`/form-drafs/` typo) was already fixed** — endpoint is
  `/form-drafts/${draftId}`. A stale test comment ("currently RED: typo …")
  remained and was tidied.
- **Stale paths:** items 5–7 referenced `apps/web/...`, but that directory is now
  empty; the real files are under `apps/forms/`.
- **Items 3 & 4 are not small.** Measured by temporarily enabling the flags and
  building: `noUncheckedIndexedAccess` (item 3) surfaces 23+ type errors and
  breaks core leaf packages (`form-types`, `git-publish`, `umami-analytics`).
  Since `form-types` is a near-universal dependency, its failure blocks the whole
  monorepo build, so the true count is higher (downstream projects never
  compiled). Item 4 (`strictPropertyInitialization`, apps/api) couldn't even be
  measured because item 3 broke its deps first. → **spun out into their own
  tickets**; bundling them would make the hygiene PR un-mergeable.
- **Item 7 (`createFormDraft`) is a dead export** — zero callers repo-wide. The
  "silent save failure" isn't a live bug today. We still applied the fix (user's
  call) so the export is correct on adoption, and noted it's unused.

## What we did (this PR — the unblocked subset)

- **Item 5:** gated `<TanStackRouterDevtools />` in `apps/forms/src/routes/__root.tsx`
  behind `import.meta.env.DEV` so it's stripped from production.
- **Item 7:** `createFormDraft` now `await`s `makeFetch` so a failed save rejects
  (throws `FormFetchError`) instead of being lost as an unhandled rejection.
  Added two tests (POSTs to `/form-drafts`; rejects on failure).
- **Tidy:** removed the stale "currently RED: typo" comment in `forms.spec.ts`.

## Deferred / blocked (not in this PR)

- **Items 1 & 2 (CODEOWNERS, SECURITY.md):** blocked on the lead — need the
  ownership/team handle and the security disclosure contact. Asked via an issue
  comment; will land once answered.
- **Items 3 & 4:** to be filed as separate TypeScript-hardening tickets.

## Verify

`forms:test` 774 passed (incl. 2 new); `forms:build` clean. Reverted unrelated
`routeTree.gen.ts` quote-style churn regenerated during build.

## Open questions

- CODEOWNERS ownership + GitHub team handle; SECURITY.md contact (with lead).
