# Plan: Draft & Protected Content (Preview Mode)

## Goal

Let content authors mark a markdown page as either **draft** (hidden entirely from the public) or **protected** (page visible publicly, but form sub-routes gated). Reviewers preview gated content by appending `?preview={token}` to any URL, which sets an HTTP-only cookie; `?preview=exit` clears it. Token comes from an env var.

## Approach

Frontmatter + route loaders + a tiny cookie handshake, all server-side. We add two booleans to the frontmatter schema, filter the content registry / search index by them, and add route loader guards that 404 ungated requests.

**Two flags (mutually compatible, but `draft` implies `protected` semantics for the sub-routes):**

| Flag                | Page visible publicly? | `/start` & `/form` reachable publicly? | In search / listings? |
|---------------------|------------------------|----------------------------------------|------------------------|
| (neither)           | yes                    | yes                                    | yes                    |
| `protected: true`   | yes                    | **no**                                 | yes                    |
| `draft: true`       | **no**                 | **no**                                 | **no**                 |

With the preview cookie set, all three columns become "yes" regardless of flag.

**Alternatives considered:**

- A single `visibility: 'public' | 'protected' | 'draft'` enum — slightly tidier but more invasive for existing files; two booleans match what was asked for and read clearly in YAML.
- Middleware-level gating instead of per-route loaders — heavier; route loaders are the natural TanStack Start hook and only a handful of routes need it.

## Scope

**Frontmatter**

- Add `draft?: boolean` and `protected?: boolean` to `FrontmatterSchema` and the resolved `Frontmatter` type.

**Content registry**

- The registry already loads all markdown. Leave the registry itself unfiltered (server-side guards still need to see drafts to render them for previewers). Filtering happens at the query sites below.

**Cookie + token handshake**

- New env var: `LANDING_PREVIEW_TOKEN` (string, required for preview to work; absent = preview disabled).
- Cookie: `landing_preview`, HTTP-only, `Secure`, `SameSite=Lax`, 7-day max-age, path `/`. Value = the token (compared with constant-time equality on read).
- New helper module `src/lib/preview-mode.ts` (server-only) exporting:
  - `hasPreviewCookie(request)` → boolean
  - `handlePreviewQuery(request)` → if URL has `?preview=…`, returns a Response that sets/clears the cookie and redirects to the same URL minus the query; otherwise returns null.
- Wire `handlePreviewQuery` into the root route loader (or a server middleware if cleaner in this TanStack Start version) so it runs on every request before route logic.

**Route guards (server-side, in loaders)**

- `routes/$.tsx` loader (the splat that resolves markdown pages):
  - If matched page has `draft: true` and no preview cookie → `throw notFound()`.
  - Filter `PAGES` used in category / subcategory listings to exclude `draft: true` pages when no preview cookie.
- `routes/*.form.tsx` loaders (the three existing form routes, plus any future ones — we'll add to a shared helper):
  - Look up the parent page in the registry; if `draft` or `protected` and no preview cookie → `throw notFound()`.
- `/start` URLs: confirm during implementation whether they resolve to a real route or are just markers the `StartLink` component rewrites. If they hit a route, gate it the same way. If they're rewritten client-side only, ensure the rewrite produces a 404 when the underlying form is gated.

**Search index** (`src/lib/search.ts`)

- `buildIndex()` currently runs once at module load. Refactor so it can be called with a filter (or build two variants: public vs preview). Public index excludes `draft: true` pages. The `search()` function picks which index to use based on a `previewMode` flag passed from the caller.
- `routes/search-results.tsx` loader passes `hasPreviewCookie(request)` into `search()`.

**MarkdownContent / rehype plugin**

- Delete `src/lib/rehype-hide-start-links.ts` and its tests; remove the import and the `hasResearchAccess` prop chain from `MarkdownContent.tsx`. Once route-level gating is in place, no in-body link hiding is needed — a protected page's form never resolves anyway, and a draft page never renders for the public.

## Files

**Add:**

- `apps/landing/src/lib/preview-mode.ts` — server-only cookie helpers & query handler
- `apps/landing/src/lib/preview-mode.test.ts`
- `docs/decisions/0006-content-visibility-flags.md` — record the two-flag model and why

**Modify:**

- `apps/landing/src/lib/frontmatter.ts` — add `draft`, `protected`
- `apps/landing/src/lib/search.ts` — accept `previewMode` filter
- `apps/landing/src/routes/__root.tsx` — wire `?preview=…` handler
- `apps/landing/src/routes/$.tsx` — gate page render + listings
- `apps/landing/src/routes/search-results.tsx` — pass preview flag
- `apps/landing/src/routes/*.form.tsx` (×3 known) — add gating
- `apps/landing/src/components/MarkdownContent.tsx` — remove `hasResearchAccess`

**Delete:**

- `apps/landing/src/lib/rehype-hide-start-links.ts` + its tests

## Verify

- Unit tests for `preview-mode.ts`: cookie set/clear, constant-time comparison, redirect target strips only the `preview` param, no-token env disables preview.
- Unit test for frontmatter: `draft` and `protected` parse correctly and default to `false`.
- Unit test for search: a `draft: true` page is absent from the public index, present in the preview index.
- Route-level smoke: a markdown page with `draft: true` → 404 without cookie, renders with cookie. Same for one `.form.tsx` route with `protected: true` on its parent.
- Manual run (`pnpm --filter @govtech-bb/landing dev`) and click through: hit `?preview=<token>` and confirm cookie is set, hit `?preview=exit` and confirm cleared, confirm draft page doesn't appear in category listing pre-preview and does post-preview.

## Open questions

1. **`/start` resolution** — does any route currently serve `/<page>/start`, or are start links only ever rewritten to the forms app by the `StartLink` component? Implementation will confirm by grepping; if there's a real route, it gets the same loader guard.
2. **Preview-mode UI affordance** — should previewed pages show a visible banner ("Preview mode active — exit") so reviewers don't forget the cookie is set? Not required by the spec; flagging because it's a low-cost addition that prevents confusion.
3. **Token rotation** — do we need to support multiple valid tokens at once (e.g. `LANDING_PREVIEW_TOKENS=a,b,c`) so the team can rotate without a forced exit? Defaulting to single-token for now; easy to expand later.
