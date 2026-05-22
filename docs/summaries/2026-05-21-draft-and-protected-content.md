# Draft & protected content — Session Summary

**Date:** 2026-05-21
**Branch:** dev
**Plan:** [docs/plans/draft-and-protected-content.md](../plans/draft-and-protected-content.md)
**Decision record:** [docs/decisions/0006-content-visibility-flags.md](../decisions/0006-content-visibility-flags.md)

## Context

`rehype-hide-start-links` was hiding the "Complete the online form" anchor
on every content page in production. The plugin's gating was tied to a
`hasResearchAccess` viewer flag that no caller ever passed, so the
default (`false` → hide) was running everywhere. The user's actual need
was the opposite shape entirely: hide form entry points only when the
content marks itself as protected or unpublished, not based on viewer
identity. Out of that grew a two-flag content-visibility model with a
shared preview cookie for editors.

## What we did

- Added `draft` and `protected` booleans to the page frontmatter schema.
- New `preview-mode.ts` (pure helpers) + `preview-mode.server.ts` (cookie
  I/O bound to the TanStack Start request context). Preview cookie
  `landing_preview` set via `?preview={LANDING_PREVIEW_TOKEN}`, cleared
  via `?preview=exit`. Handshake runs in `__root.tsx` `beforeLoad`, which
  exposes `previewMode` on the route context for everything downstream.
- Route guards: `$.tsx` 404s `draft` pages and filters them from listings;
  the three `*.form.tsx` routes 404 when their parent page is `draft` or
  `protected` and there's no preview cookie.
- Search index split into two cached variants (public / preview); the
  search route picks one based on `previewMode`.
- `rehype-hide-start-links` kept (not deleted as the initial plan
  suggested) but renamed its option `hasResearchAccess` → `hideStartLinks`
  and dropped the dead `isExternalForm` branch. `MarkdownContent` now
  computes `hideStartLinks = (protected || draft) && !previewMode`.
- New unit tests for the rehype plugin (previously untested) and the
  preview-mode decision logic.

## Why we did it that way

**Per-page metadata, not viewer identity.** `hasResearchAccess` was a
viewer-mode flag — meant to tell the rehype plugin "this user has
elevated access." But content visibility is intrinsically a property of
the content, not the audience. Flipping the model means a single
frontmatter edit (set `draft: true` / remove it) controls visibility,
and the editor preview cookie is just an override — not a role.

**Two flags, not an enum.** A `visibility: 'public' | 'protected' |
'draft'` enum was considered. Two booleans won because (a) they read
clearly in YAML, (b) they're independent in principle even if they
overlap in effect, and (c) they leave room for additional gating axes
later without forcing an enum migration. The user explicitly asked for
two flags.

**Soft gating, by design.** Markdown bodies are bundled into the client
JS via `import.meta.glob({ eager: true, query: '?raw' })`, so a
`draft: true` page's text remains in the JS bundle even though the URL
404s. We surfaced this and asked the user; they confirmed soft gating
was fine. The alternative — moving the registry behind a server function
so drafts never reach the client — is a much bigger refactor that wasn't
worth it for the public-information threat model. ADR-0006 calls this
out explicitly so a future agent doesn't quietly assume hard gating.

**Kept the rehype plugin instead of deleting it.** The initial plan said
to delete the plugin once route-level gating was in place, on the
assumption that "blocked pages never render." That assumption was wrong
for `protected`: the page *does* render, the user wanted the inline
"there are 2 ways → 1 way" rewrite to keep working on protected pages,
and the `<a data-start-link href=".../start">` markers don't go through
any route — they're just markdown that needs to be filtered at the
rendering layer. So the plugin stays; only its option name changes and
the dead viewer-mode branch comes out.

**`/start` is not a route.** The original plan listed `/start` as a
sub-route to gate. Orientation revealed it's a marker in markdown that
`MarkdownContent.tsx` rewrites at render time to point at the external
forms app (`${FORMS_BASE_URL}/forms/${formId}`). There's nothing to
guard at the route level for `/start`; the inline rewrite by the rehype
plugin is the actual gating point. Only the `*.form.tsx` files (the
in-app calculator routes) are real route guards.

**Cookie wiring in `beforeLoad`, not server middleware.** TanStack Start
supports custom server middleware, but `beforeLoad` on the root route
runs server-side on initial render via `createServerFn`, can `throw
redirect(...)` cleanly, and slots `previewMode` into the route context
in the same step — which is exactly what every downstream loader needs.
Middleware would have meant a second mechanism for the same job.

## What we almost got wrong

**Initial `preview-mode.ts` broke the production build.** First pass put
the server-only cookie imports (`getCookie`/`setCookie` from
`@tanstack/react-start/server`) alongside the `requireFormAccess` helper
in a single module. Because the form route files import
`requireFormAccess`, the bundler saw server imports being pulled into
client code and refused to build. Caught by `pnpm build` only — typecheck
and tests both passed. Fixed by splitting into `preview-mode.ts`
(pure / client-safe) and `preview-mode.server.ts` (server imports).
Worth remembering: TanStack Start enforces the boundary; lean on the
build, not just the type checker.

## Open questions

- **No UI preview-mode indicator.** Editors using the cookie don't see
  any visual signal they're in preview mode. The data is already in
  context (`Route.useRouteContext().previewMode`); a future change can
  add a banner without touching anything else. Skipped to keep the
  diff focused.
- **Single shared token.** No support for multiple valid tokens or
  scoped (per-page / per-editor) tokens. Flagged in the plan; trivial
  to extend later if needed.
- **End-to-end browser verification was deferred.** Automated coverage
  (typecheck, lint, 77 unit tests, prod build) all green. Driving the
  full handshake through a real dev server requires a draft fixture
  page and a reachable forms-API endpoint; both deferred to a later
  session when a real protected/draft page is added.
