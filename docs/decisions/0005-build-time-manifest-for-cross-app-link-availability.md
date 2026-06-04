# 0005 — Cross-app link availability is sourced from the destination app's API at build time

**Date:** 2026-05-21
**Status:** Superseded by [0030](./0030-landing-resolves-form-availability-at-runtime.md)
**Supersedes:** [0004](./0004-form-scheme-for-cross-app-links.md)

## Context

The landing app (`apps/landing`) needs to render call-to-action buttons
that send users into other apps in the gov-bb estate — most immediately
the forms app at `forms.alpha.gov.bb`, where each form is reachable at
`/forms/<formId>`.

[ADR-0004](./0004-form-scheme-for-cross-app-links.md) addressed this
with a custom `form:<slug>` URL scheme in Markdown, resolved through a
hand-maintained registry (`apps/landing/src/content/form-ids.ts`)
mapping content slugs to form IDs. The principle behind 0004 was right:
content shouldn't contain absolute URLs to other apps. The mechanism
turned out to be wrong.

Two problems surfaced within hours of merging 0004:

1. **The registry is a parallel database.** Form IDs are owned by the
   forms team. Whenever they add, rename, or remove a form, the landing
   app's registry needs a manual edit. Forgetting silently breaks Start
   now buttons in production.
2. **It went stale immediately.** The forms team dropped `*-test`
   suffixes from sandbox form IDs and removed YouthADVANCE Corps
   Recruitment, all on the same day as 0004 landed. The committed
   registry was already wrong.

The forms team had an API endpoint exposing the canonical list of
available forms — `${VITE_FORMS_API_URL}/form-definitions`. The right
move was to drive availability from that, not from a checked-in file.

## Decision

**Cross-app link availability is determined at build time by fetching
the destination app's authoritative list endpoint and emitting a
generated manifest. Content declares which destination it wants to link
to via frontmatter. The renderer checks the manifest at render time and
hides the link silently if the destination isn't available.**

Concretely, for the landing → forms handoff:

- **A pre-build script** at `apps/landing/scripts/fetch-form-manifest.mjs`
  runs as the `predev` and `prebuild` lifecycle step. It fetches
  `${VITE_FORMS_API_URL}/form-definitions`, validates the response
  shape, and writes
  `apps/landing/src/content/available-forms.gen.ts` exporting an
  `AVAILABLE_FORMS: ReadonlySet<string>`. The file is gitignored — it's
  a build artifact, not source.
- **Content declares its destination in frontmatter.** Each `start.md`
  (or single-file page) that wants a Start now button carries a
  `form_id: <api-formId>` field. Authors don't write URLs or schemes
  in Markdown; they write a metadata field at the top of the file.
- **The Markdown body uses an empty `<a data-start-link>` marker** for
  position. The anchor renderer reads `form_id` from a React context
  (populated by `MarkdownContent` from the page's frontmatter), checks
  it against the manifest, and either renders a `<StartLink>` pointing
  at `${VITE_FORMS_URL}/forms/${form_id}` or renders nothing.
- **Misses are silent in production, loud in development.** When a
  page's `form_id` isn't in the manifest, the button is suppressed
  without comment in prod (the form may simply not be deployed yet);
  `console.warn` fires in dev so authoring typos are visible during
  review.
- **The build fails if the API is unreachable.** Better a visible
  deploy failure than silently shipping a landing site with zero Start
  now buttons. The script also fails if the API returns zero forms.
- **Two env vars.** `VITE_FORMS_API_URL` is read at build time only
  (server-to-server fetch). `VITE_FORMS_URL` is the user-facing forms
  app URL embedded in resolved button hrefs.

The same pattern applies to any future cross-app destination that
exposes a list endpoint. Frontmatter field names follow the convention
`<destination>_id` (`form_id`, future `payment_id`, etc.); manifests
get one `.gen.ts` file per destination; the renderer pattern is shared.

## Consequences

- **No hand-maintained mapping file.** When the forms team renames,
  adds, or removes a form, the next landing-app build picks up the
  change automatically. The only manual work is when content needs to
  start pointing at a new form, which is content work anyway.
- **Frontmatter is the discoverable surface.** Anyone reading a
  `start.md` can see at the top of the file which form it points at.
  No grep across files; no separate registry to chase.
- **Authors keep button placement control.** The `<a data-start-link>`
  anchor stays in the Markdown body where the author wants it. The
  renderer fills in the destination URL; the author owns the layout.
  A page can have zero, one, or multiple Start now buttons.
- **Stale manifests are impossible.** The manifest is a build
  artifact. It's regenerated on every `pnpm run dev` and every CI
  build. There's no scenario where it survives across deploys without
  being refreshed.
- **API outage at build time = build failure.** Deliberate. The
  alternative — empty manifest, no buttons, silent regression — is
  worse. If this becomes a problem in practice, the script can grow a
  `--allow-stale` mode that reads a checked-in last-known-good
  manifest as a fallback. Out of scope today.
- **Per-form analytics names follow the form ID, not the content
  slug.** Umami events for Start now buttons are `<form_id>-start`
  (e.g. `get-birth-certificate-start`). When the form ID and the
  landing slug coincide, this matches the convention established by
  [0002-umami-tracking](../summaries/2026-05-20-umami-tracking.md);
  when they don't (e.g. `apply-to-jobstart-plus-programme` content →
  `jobstart-plus-programme` form), the metric is keyed on the form
  the user actually started, which is the more useful slicing.
- **Manifest-aware tests stay practical.** Unit tests that render
  `MarkdownContent` need to provide a known `form_id` and either rely
  on the real generated manifest or mock the `AVAILABLE_FORMS` import.
  No test should ever stub the registry-resolver-throws-on-unknown
  pattern from 0004; that path no longer exists.
- **Reverse direction unchanged.** Other apps linking back into
  landing still use ordinary `/<path>` URLs — landing is the
  canonical content site and its URL shape is part of the public
  contract. This decision only governs landing → other-app links.
- **Future cross-app destinations follow this pattern.** Anyone wiring
  a "Pay now" or "Check status" button from landing into another app
  should add a new pre-build script + manifest + frontmatter field,
  not a hand-maintained registry. If a destination has no list
  endpoint, the right move is to ask the destination team to add one.
  Re-open this decision rather than fall back to a hand-maintained
  registry.
