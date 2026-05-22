# 0006 — Content visibility is driven by per-page frontmatter flags, not by viewer identity

**Date:** 2026-05-21
**Status:** Accepted
**Supersedes:** the dormant `hasResearchAccess` flag in `MarkdownContent` and `rehype-hide-start-links`

## Context

The landing app needs a way to keep some content out of the public's hands
without deleting it from the repository or branch. Two concrete needs:

1. **Drafts.** Authors want to land a content page in `main` ahead of the
   feature it describes, share a preview link with stakeholders, and then
   make the page go live by removing a single flag.
2. **Pages whose form isn't ready yet.** The information page may be safe
   to publish, but the in-app calculator or external form behind its
   "start" link isn't. The page should remain publicly visible; the
   "start" link should not.

The existing mechanism — `hasResearchAccess` on `MarkdownContent` — was
the wrong shape for either need. It was a viewer-identity flag (the
viewer is a "researcher" with elevated access), it was never actually
wired up by any caller, and it confused two separate axes ("who is
looking" vs. "what is the content saying about itself").

## Decision

**Visibility is a property of the content, declared in frontmatter, not a
property of the viewer. A single shared preview cookie lets editors and
stakeholders see gated content.**

Two booleans on each Markdown page's frontmatter:

| Flag                | Page visible publicly? | Form sub-routes reachable publicly? | In search / listings? |
|---------------------|------------------------|--------------------------------------|------------------------|
| (neither)           | yes                    | yes                                  | yes                    |
| `protected: true`   | yes                    | **no**                               | yes                    |
| `draft: true`       | **no**                 | **no**                               | **no**                 |

With the preview cookie set, all three columns become "yes" regardless
of flag — previewers see gated content as if it were live.

**The preview handshake.** A single token configured at
`LANDING_PREVIEW_TOKEN` (env var) unlocks preview mode. Appending
`?preview={token}` to any URL sets an HTTP-only, `Secure` (in
production), `SameSite=Lax` cookie named `landing_preview` with a 7-day
max-age. Appending `?preview=exit` clears the cookie. The handshake
runs in a `beforeLoad` on the root route, so any URL works as the entry
point. Invalid `?preview=…` values are stripped from the URL without
setting a cookie, so a mistyped token doesn't stick around in browser
history, referrers, or access logs. Token comparison is constant-time.

**Where the gating runs:**

- `routes/$.tsx` (the splat that resolves Markdown pages) 404s a `draft`
  page when no preview cookie is present, and filters `draft` pages out
  of category and subcategory listings.
- `routes/*.form.tsx` (the three in-app form routes) 404 when their
  parent page is `draft` or `protected` and no preview cookie is present.
- `src/lib/search.ts` builds two cached indices — public (no drafts) and
  preview (everything) — and the search results route picks one based on
  the cookie state.
- `MarkdownContent` continues to use `rehype-hide-start-links` to drop
  inline `<a data-start-link>` buttons from the rendered Markdown body
  when the page is `protected` (or `draft` and being previewed by an
  editor who shouldn't yet see the start link — although in practice
  draft pages don't render to the public at all). The plugin's option
  is renamed from `hasResearchAccess` to `hideStartLinks` to match the
  new mental model.

**Threat model: soft gating, by design.** Markdown bodies are bundled into
the client JS via `import.meta.glob({ eager: true, query: '?raw' })`,
which means a determined visitor with browser devtools can read the raw
text of any `draft: true` page even though the URL 404s. This is
acceptable for v1: the target threat is casual discovery (a visitor
stumbling on a half-finished page via search or a guessed URL), not
sophisticated extraction. If a future use case needs hard gating — e.g.
content that genuinely shouldn't leave the server — that's a separate
decision and a bigger refactor (the registry would need to load page
bodies via a server function instead of `import.meta.glob`).

## Consequences

- **Authoring is a one-flag change.** Setting `draft: true` hides the
  page from production; removing the flag publishes it. No branch
  juggling, no separate "draft repo," no environment-specific content
  trees. Same for `protected`.
- **`hasResearchAccess` goes away.** Dead viewer-mode logic removed
  from the rehype plugin and from `MarkdownContent`'s public API. The
  plugin now takes a single `hideStartLinks: boolean` option, which is
  what the call site already wanted to express. If a viewer-identity
  concept ever comes back, it's orthogonal — different axis, different
  flag.
- **Preview links are stakeholder-friendly.** Any URL on the site works
  as a preview entry point. A reviewer clicks `https://gov.bb/<draft-page>?preview=<token>`,
  gets the cookie, and can then navigate freely. Exit with
  `?preview=exit`.
- **Single shared token, not per-page.** The simpler model. If we need
  scoped previews later (one editor, one page) we can extend, but
  scoped previews are a much heavier feature than what's required today.
- **No banner in v1.** Previewers don't see a visible "preview mode
  active" indicator. We left it out to keep the diff small. If editors
  start losing track of cookie state, add a small banner; the route
  context already carries `previewMode` so the data is one prop away.
- **The cookie is HTTP-only.** Client-side JavaScript can't read or
  forge it. The trade-off is that we can't show a "you are previewing"
  badge from client code without a separate hint (e.g. a non-HTTP-only
  companion cookie, or a route-loader-provided context value — which is
  what we already do via `Route.useRouteContext().previewMode`).
- **Soft gating means drafts are bundled.** Anyone willing to inspect
  the JS bundle can read draft Markdown. We're not protecting trade
  secrets here; this is unfinished content for a public information
  site. Re-open this decision if that ever changes.
