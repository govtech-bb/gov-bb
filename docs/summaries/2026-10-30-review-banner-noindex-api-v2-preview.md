# api_v2 preview pages get the review banner and noindex (#3246)

## Context

Landing fixed every api_v2 page's `level` to `public`, so a reviewer opening a
preview page from the database would see no "Under review" banner, and the
page would carry canonical, OG and JSON-LD like a public one. api_v2 knew the
page's effective visibility (`hiddenFrom`) but never said it; #2961 had parked
that as an api_v2 change.

## What we did

- api_v2 (own PR): `PublicPage.visibility` is `public | preview`, computed in
  `toPublicPage` with `hiddenFrom("public", page, ancestors)`.
- landing (this PR, "Part of #3246"): `PageResponse` parses it leniently,
  `fromApiV2` defaults it to `public`, and `$.tsx` uses it as an api_v2 page's
  `level`. The banner and head were already keyed on `level`.

## Why we did it that way

- **api_v2 states the effective level, landing doesn't derive it.** The
  alternatives were "anything read with the preview token is preview" (puts
  the banner and `noindex` on public pages a reviewer opens) and two reads per
  reviewer view (racy, more code). The effective rule must fold in the pages
  above, as the static `resolvePageLevel` does: a public child of a preview
  page is reviewer-only.
- **Reuse `hiddenFrom`.** The first cut spelled the rule out again
  (`.some(p => p.visibility !== "public")`); review pointed at `hiddenFrom`,
  which keeps "a page is as hidden as anything above it" in one place.
- **`public | preview` on both sides, not landing's `VIEW_LEVELS`.** `draft`
  never reaches the site (#3247). Landing first accepted `VIEW_LEVELS`
  (including `draft`, which would fail closed: draft banner and `noindex`);
  narrowed so landing reads exactly what api_v2 can send. Anything else,
  `draft` included, reads as `public` and keeps the page.
- **Absent or unknown → `public`.** A `preview` default would put the banner
  and `noindex` on every page during a skewed deploy; preview is a rollout
  gate, not a confidentiality boundary (ADR 0013).

## What we almost got wrong

- The plan's file list missed `api-v2-page.contract.test.ts`. Its `PAGE` table
  is typed over `keyof PageResponse`, so the new field needs a row, and the
  row then fails against `openapi.json` until api_v2's PR lands. So the
  landing PR can only go green after the api_v2 PR merges and it rebases.
- `-preview-gating.test.ts` needed three registry title stubs (a public page's
  head builds breadcrumb JSON-LD from them) and `visibility: 'public'` on two
  hand-built ADR 0078 fixtures (`level` now comes from that field).

## Open questions

- End to end only once #2961 sends `x-preview-token` and bypasses the page
  cache for tokened reads; #3246 stays open until #2961's acceptance test
  passes.
