# 0004 — Cross-app links from Markdown use a `form:` scheme, not absolute URLs

**Date:** 2026-05-21
**Status:** Accepted

## Context

The landing app (`apps/landing`) is a content site. Content lives in
Markdown under `src/content/`, authored by people who don't necessarily
read code. Some pages need to send the user to a _different_ app — most
immediately the forms app at `forms.alpha.gov.bb`, where the actual
form-filling UI lives. Each form is reachable at `/forms/<formId>`.

A naive way to wire that handoff is to write the full URL into the
Markdown — `<a href="https://forms.alpha.gov.bb/forms/get-birth-certificate-test">Start now</a>`.
That fails three tests:

1. **It bleeds infrastructure into content.** The forms app's domain and
   path scheme are deployment details, not content. Content authors
   shouldn't have to know them or chase them across environments.
2. **It scales badly across environments.** The forms app runs at
   `http://localhost:3000` in dev, at a sandbox domain in staging, and
   eventually at `forms.alpha.gov.bb` in prod. Hardcoded URLs would
   demand a content edit (or per-environment build) at every cutover.
3. **It blocks the ID indirection we need.** Form IDs are currently
   sandbox-suffixed (`-test`); an upcoming change will move definitions
   into the repo with stable IDs. Either way, the ID lookup belongs in
   one file — not scattered across dozens of Markdown pages.

A simpler alternative — drop the indirection and just write
`href="/forms/get-birth-certificate-test"` directly in Markdown, letting
the deployment proxy work it out — was considered and rejected on the
same grounds: it still encodes the formId in content, still encodes
"the forms app lives at /forms" in content, and still requires a content
edit when sandbox IDs are replaced.

## Decision

**Cross-app navigation from Markdown content uses a custom URL scheme
that is resolved through a registry at render time. Content never
contains absolute URLs to other apps, and never contains the target
app's internal route shape.**

For the landing → forms handoff specifically:

- Content authors write `<a data-start-link href="form:<slug>">Start now</a>`.
  The slug is a stable identifier owned by the _content side_ (the
  start-page slug), not the forms app's `formId`.
- The slug → `formId` mapping lives in one file:
  `apps/landing/src/content/form-ids.ts`. It exports `FORM_IDS` and a
  `resolveFormHref(slug)` helper that throws on unknown slugs.
- The forms app's base URL comes from `VITE_FORMS_URL` at build time,
  with a localhost fallback for dev. It is not in content and not in
  the registry.
- The `<ReactMarkdown>` instance in `MarkdownContent.tsx` carries a
  `urlTransform` that lets `form:` URLs through the default URL
  sanitiser; the anchor handler rewrites them to
  `${VITE_FORMS_URL}/forms/${formId}` and emits a per-slug analytics
  event (`<slug>-start`) so the rewrite doesn't destroy event names.

The same pattern applies to any future cross-app destination. The
scheme name (`form:`, `pay:`, `status:`, …) reflects the _kind_ of
destination, not the specific app, so a registry can swap the
underlying app without a content rewrite.

## Consequences

- **Content is durable.** Markdown files don't change at cutover, on
  domain moves, or when sandbox IDs become prod IDs. Only the registry
  and one env var change.
- **Unknown slugs fail loudly.** `resolveFormHref` throws at render
  rather than silently producing a broken link. Broken authoring is
  surfaced in dev and CI builds instead of in production.
- **Analytics names are content-owned.** The Umami event for a Start
  now button is `<slug>-start`, derived from the content slug, not from
  the resolved URL. Renaming the forms app or its formIds doesn't
  fragment historical analytics.
- **Sanitiser must permit each scheme.** React-Markdown's default URL
  transform strips non-allowlisted protocols. Every new scheme added
  under this principle (`pay:`, `status:`, …) must be allowed through
  the `urlTransform` and resolved by the anchor handler. This is a
  one-line change in `MarkdownContent.tsx` per scheme.
- **The principle is one-way.** Other apps linking back _into_ landing
  use ordinary `/<path>` URLs — landing is the canonical content site
  and its URL shape is part of the public contract. This decision only
  governs landing → other-app links.
- **Future cross-app destinations follow this pattern.** Anyone wiring
  a "Pay now" or "Check status" or similar button from landing into
  another app should add a new scheme + registry + resolver, not
  hardcode a URL. If a future destination genuinely demands hardcoded
  URLs (e.g. a one-off external partner), re-open this decision rather
  than work around it ad-hoc.
