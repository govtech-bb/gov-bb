# Start now buttons driven by build-time API fetch — Session Summary

**Date:** 2026-05-21
**Branch:** feat/forms-links-mapping
**Plan:** [docs/plans/start-now-form-links.md](../plans/start-now-form-links.md) (revision 2)
**Decision record:** [docs/decisions/0005-build-time-manifest-for-cross-app-link-availability.md](../decisions/0005-build-time-manifest-for-cross-app-link-availability.md)

## What was built

Start now buttons on landing service pages now appear if and only if a
matching form exists in the forms API at build time. The mapping
between a landing page and a form is declared in the page's
frontmatter (`form_id`) and validated against a manifest generated at
build time from `${VITE_FORMS_API_URL}/form-definitions`. The forms
team is the canonical owner of which forms exist; the landing app
reads that contract instead of maintaining its own parallel list.

## Why it looks the way it does

**Frontmatter is the discoverable surface.** A reader opening any
`start.md` can see at the top of the file which form the page targets.
No grep across files, no registry to chase. The alternative
considered — author writes the form ID directly into the anchor's
`href` — was rejected on discoverability grounds: a metadata field at
the top of the file is more visible than an inline href deep in the
body.

**Empty `<a data-start-link>` marker keeps placement under author
control.** Authors place the marker wherever the button should sit in
the flow. The renderer reads `form_id` from React context (populated
by `MarkdownContent` from frontmatter), checks the manifest, and
either renders a `<StartLink>` or returns null. Multiple buttons on
one page work; zero is also fine. The Markdown body never contains
the destination URL.

**Build-time fetch over render-time fetch.** Two options were on the
table. Build-time emits a static `available-forms.gen.ts` set; the
runtime check is one `Set.has()` call. Render-time would hit
`/form-definitions/<slug>` per page load. The landing app is otherwise
fully static content rendered through TanStack Router; introducing a
per-page network dependency for what changes once-a-deploy was
overkill. Build-time also makes the failure mode loud — if the API is
down at build, the deploy fails visibly instead of silently shipping
a landing site with no Start now buttons.

**Build fails on API unreachable.** Deliberate. The script also fails
if the response is malformed JSON, the wrong shape, or contains zero
forms or invalid form IDs. The validation regex (`^[a-z0-9][a-z0-9-]*$`)
is strict because the form ID flows directly into both a URL and a
TypeScript module identifier — anything weird there is a smell.

**Form IDs and landing slugs are not the same thing.** Audit of the
live API showed 5 of 13 in-scope services have landing slugs that
differ from their form IDs (e.g. landing
`apply-to-jobstart-plus-programme` content →
`jobstart-plus-programme` form). The frontmatter approach handles
this naturally — `form_id` is declared independently of the page
slug. The alternative — mass-rename landing pages to match — would
change user-facing URLs and require redirect handling, for no real
benefit.

**Analytics names are keyed on the form, not the page.** The Umami
event is `<form_id>-start`. When form_id and landing slug coincide
(8/13 services), this matches the convention from the umami-tracking
work. When they differ, the metric is keyed on the form the user
actually started, which is the more useful slicing — it lets product
ask "how many people started form X" without having to remember
which landing page funnels into which form.

**Missing forms silently hide the button.** Production behaviour: if
a page declares `form_id: foo` and `foo` isn't in the manifest, the
button doesn't render and nothing else changes. Dev behaviour:
`console.warn` fires once per render so authoring typos surface
during review. Neither path is loud in prod because forms come and
go on the API side — surfacing every transient mismatch as a render
error would create deploy fragility.

**Two env vars, two purposes.**
`VITE_FORMS_API_URL` is read by the build script only — it's a
server-to-server URL. `VITE_FORMS_URL` is embedded into resolved
button hrefs at render time — it's what the user's browser hits.
Splitting them lets sandbox vs prod use different routing topologies
if the API and the user-facing forms app live at different domains.

**YouthADVANCE Corps lost its Start now button.** The form was
removed from the API entirely. The single-file landing page reverts
to its paper-application-only flow. When the form comes back (under
any ID), adding `form_id: <new-id>` + a marker brings the button
back without a code change.

**`form-ids.ts` is gone.** With the manifest doing slug → existence
mapping and frontmatter doing page → form ID mapping, there's
nothing left for it to own.

## Decisions worth flagging

- **The `<destination>_id` frontmatter naming convention.** Future
  cross-app destinations (`payment_id`, `status_id`, …) should
  follow the same pattern: a frontmatter field per destination,
  one generated manifest file per destination, the renderer
  pattern shared. This is named in ADR-0005's _Consequences_ but
  worth keeping front of mind when the next cross-app target
  arrives.
- **Build artifact location convention.** Generated TypeScript
  modules end in `.gen.ts` and live next to the source they
  augment (here, `src/content/available-forms.gen.ts`). They go in
  `.gitignore`. The forms app already follows this for
  `routeTree.gen.ts`; landing now follows the same pattern.

## Follow-ups

- Set `VITE_FORMS_URL` and `VITE_FORMS_API_URL` per environment in
  Amplify. Sandbox URLs are the defaults baked into the code and
  the example env; prod URLs need confirming with the forms team
  once the prod domains are wired.
- Out-of-scope pages (`calculate-severance-pay/start.md`,
  `get-a-primary-school-textbook-grant/start.md`) keep their old
  href markers and now silently render no button. If product wants
  a placeholder state ("form coming soon") instead of nothing,
  that's a separate UI affordance.
- Pre-existing TS error at
  `apps/landing/src/content/registry.ts:58` (gray-matter typing)
  still blocks `nx typecheck landing`. Unrelated to this work.
- The forms team owns the formIds end-to-end. A worthwhile
  follow-up — but not required — is to wire a CI check on the
  forms repo that any rename or removal of a formId either
  generates a deprecation notice or coordinates with the landing
  team. Until then, the dev `console.warn` is the only signal a
  content author has that they're pointing at a stale ID.
