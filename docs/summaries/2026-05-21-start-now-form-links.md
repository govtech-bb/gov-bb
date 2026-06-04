# Start now → forms-app links — Session Summary

**Date:** 2026-05-21
**Branch:** feat/forms-links-mapping
**Plan:** [docs/plans/start-now-form-links.md](../plans/start-now-form-links.md)
**Decision record:** [docs/decisions/0004-form-scheme-for-cross-app-links.md](../decisions/0004-form-scheme-for-cross-app-links.md)

## What was built

Every Start now CTA on the landing site now resolves to the real form in
the forms app via a single-file registry. Authoring stays in Markdown:
`<a data-start-link href="form:<slug>">Start now</a>`. At render time the
anchor handler looks up `FORM_IDS[slug]` and rewrites the href to
`${VITE_FORMS_URL}/forms/${formId}`. Wired for 13 services (11
folder-style start pages plus the YouthADVANCE Corps and Summer Camp
single-file pages). Renewal pages and pages with no matching API form
were left untouched; missing forms with no landing page at all are out
of scope until content authors can add them.

## Why it looks the way it does

**The 13 existing Start now buttons were already pointing at the wrong
shape.** Each `start.md` had
`<a data-start-link href="/<category>/<slug>/form">Start now</a>` — a
slug-pattern path that no route in either landing or forms actually
serves. The forms app routes are `/forms/$formId/`. So the buttons
already in production were almost certainly broken; this session
diagnosed that as part of the analysis and replaced all of them.

**Registry indirection over inline URLs.** Three options were on the
table: (1) hardcode `/forms/<formId>` in each start.md, (2) put `form_id`
in frontmatter and let the renderer compose the URL, (3) a `slug → formId`
registry referenced via a custom `form:<slug>` href scheme. The user
explicitly asked for "form IDs in one file so swapping sandbox for prod
is a single edit," which rules out (1). Frontmatter (2) keeps the
mapping next to the content but spreads it across 13+ files. The
registry (3) won — one file to edit, content authors never see formIds.
The trade-off is the registry adds a layer of indirection that someone
reading a markdown file in isolation can't resolve; mitigated by the
helper throwing loudly on unknown slugs so broken refs show up in dev,
not in production.

**`form:` URL scheme over a custom data attribute.** Alternative: keep
`href="/some-placeholder"` and add `data-form-slug="<slug>"`, then
resolve via the attribute. Rejected because react-markdown still renders
the bogus href into the DOM, so the link's hover URL would lie. Using a
custom scheme makes the intent visible in the markdown and gives the
renderer a clean signal to act on.

**ReactMarkdown's URL sanitiser was silently nuking the scheme.** The
first cut shipped without a `urlTransform`; hover-on-button revealed
the buttons all pointed at the current page URL instead of the forms
app. Diagnosis: react-markdown's default sanitiser only allows
`http|https|mailto|tel`, and stripped `form:` to `undefined` before our
component handler ran. `safeHref ?? '#'` then resolved to the current
URL. Added a `urlTransform` that explicitly passes `form:` through.
This is now a documented obligation for any future scheme added under
ADR 0004.

**Per-slug analytics events preserved.** `StartLink` calls
`deriveStartEventName(href)` from `analytics.ts` to emit a
`<slug>-start` Umami event. Naively resolving `form:<slug>` to
`/forms/<id>` would change the event name to
`forms-<id>-start`, fragmenting the funnel metric that
[0002-umami-tracking](../summaries/2026-05-20-umami-tracking.md)
deliberately set up. The fix: pass an explicit `eventName` prop to
`StartLink` when the URL came from a `form:` href, derived from the
content slug rather than the resolved URL. Analytics names are now
owned by content, not by the deployment URL shape.

**Env-driven forms base URL, with a localhost fallback.** Shannon and
Harry confirmed mid-session that the forms app is moving to its own
domain (`forms.alpha.gov.bb`). `VITE_FORMS_URL` reads the base URL at
build time; `apps/landing/.env.example` documents it; default falls
back to `http://localhost:3000` (the `pnpm run dev:forms` port). No
content edit required at cutover, just an Amplify env var change.

**The sandbox `*-test` formIds are deliberately baked in for now.**
Harry flagged that Isaiah is moving form definitions out of the
database and into committed files in the repo. After that lands,
formIds will be stable across environments and the `*-test` suffixes
disappear. Until then, the registry holds them; the cutover is a
single-file edit. We didn't build env-keyed sandbox/prod registry
support because Isaiah's change will likely make the cutover trivial
anyway.

**Severance pay and textbook grant were left alone.** Both have
existing Start now CTAs pointing at the old `/<category>/<slug>/form`
path. Both have no matching formId in the API. Zainab's call: leave
them until formIds exist rather than wiring a broken target or pulling
the button. Documented in the plan's Out of scope.

**Driver licence and passport renewals deferred.** The API has
`driver-licence-renewal` and `passport-renewal` forms but the
matching landing pages are about _applying_, not renewing. A
renew-vs-apply page split is a content design question, not a wiring
question. Skipped until dedicated renewal pages exist.

**Side-quest: 500 on `GET /form-definitions/example-name-change`.**
Mid-session, the user hit a 500 from the local API. Diagnosis: the
seed in `apps/api/src/database/seed.ts` stored inline primitive fields
(`{fieldId, label, htmlType, validations}`), but the endpoint goes
through `registryService.hydrateForm()`, which expects the recipe
shape `{ref: "components/...", overrides: {...}}`. The resolver was
called with `undefined` refs and threw `UnresolvableComponentError`,
which the global filter masked as a generic 500. Rewrote the seed to
use `components/first-name` and `components/last-name` refs and
bumped the seed version so the existing row gets re-inserted. **The
seed change was reverted by the user before the wrap and is not in
the commit.** Flagged here so the diagnosis isn't lost if the same
500 reappears.

## What `routeTree.gen.ts` is doing in the diff

It's autogenerated by TanStack Router. Re-running the forms dev
server on a different formatter setting rewrote it (quotes, semis).
Not part of this session's work; excluded from the commit.

## Decisions worth flagging

- **The `form:` scheme is now a convention, not a one-off.** ADR 0004
  is broader than this PR — it constrains _any_ future cross-app link
  from Markdown. The list of allowed schemes in `urlTransform` is the
  enforcement point.
- **Analytics names are content-owned.** `StartLink`'s `eventName`
  override establishes the principle that URL rewriting must not
  fragment per-content metric names. Worth keeping in mind if more
  schemes get added.
- **`VITE_FORMS_URL` is now part of the landing app's contract.** If
  another package or app wants to know where forms live, they should
  read this env var, not duplicate it.

## Follow-ups

Tracked in detail in the plan's _Open questions_ section. Headline
items:

- Set `VITE_FORMS_URL=https://forms.alpha.gov.bb` in the Amplify console
  for the landing app once the domain is live.
- After Isaiah's "definitions in repo" change lands, replace the
  `*-test` IDs in `FORM_IDS` with the permanent ones. Confirm whether
  the api's `/form-definitions/*` endpoint stays or gets removed — the
  seed-bug diagnosis above will become moot if it goes.
- Carve `apps/form_builder` into its own internal-only deployment per
  Harry, so content authors can add the missing landing pages.
- Pre-existing TS error in `apps/landing/src/content/registry.ts:58`
  blocks `nx typecheck landing`. Unrelated to this work but worth
  fixing in a separate PR.
