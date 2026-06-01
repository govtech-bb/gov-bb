# Content feature flagging for `apps/landing`

> Status: planned — not yet implemented. Implementation is a separate session
> (`/bb:dev-start`).

## Goal

Let individual markdown content pages in `apps/landing/src/content` be flagged
as "under review" so they are **invisible to the public** (not routable, not
listed, not in the search index, not indexed by crawlers) while a reviewer
holding a shared secret can **preview them on any environment, including
production**. Flipping a page's flag from `preview` to `public` is the
gradual-rollout switch: it releases the page to everyone.

The flag is **two-level** — it behaves differently depending on which file
carries it:

- **`preview` on a top-level page** (e.g. `get-birth-certificate/index.md`) →
  the whole page is hidden (404 for the public; see §3–§5).
- **`preview` on a sub-page** (e.g. `get-birth-certificate/start.md`) → the
  sub-page route (`/start`) and the matching `/form` route 404 for the public,
  **and** the still-public parent page renders with the online-application
  method removed and its "N ways" count rewritten down (e.g. "There are 2 ways"
  → "There is 1 way"); see §6. Token holders see the full content. This is the
  common gradual-rollout case: the information page is live, but its digital
  service is still in review.

This is the agreed shape after discussion:

- **Audience model:** a single shared **preview token** (no user accounts, no
  login). Works on any deploy, including prod.
- **Secrecy level:** review pages are hidden from nav / search / routing for the
  public, but their markdown still ships in the client bundle (acceptable — the
  content is "not ready", not confidential). This means gating is a **runtime**
  concern, not a build-time exclusion.

## Why this shape

`apps/landing` is a TanStack Start (SSR) app with **no auth** today. All content
is loaded at build time via `import.meta.glob(..., { eager: true })` in
`src/content/registry.ts`, so every page is already bundled. Given the secrecy
answer ("hidden, not secret"), the cheapest correct design keeps the full
`PAGES` set in the bundle and gates *visibility* per request, rather than
splitting the build or standing up an auth system.

### Alternatives considered

- **Environment-based gating** (show flagged pages only on sandbox/staging).
  Rejected: the user wants reviewers to preview on *any* environment, incl.
  prod, and to control access with a token rather than a URL.
- **Real per-user auth** (accounts / allowlist). Rejected for now: far larger
  scope; the requirement is satisfied by a shared token. The `visibility` enum
  (below) leaves room to grow toward named audiences later without a rewrite.
- **Build-time exclusion** of review pages from the bundle. Not needed given the
  "hidden, not secret" decision, and it would complicate the single build that
  ships to all environments.

## Approach

### 1. The flag — `visibility` frontmatter field

Add to `FrontmatterSchema` in `apps/landing/src/lib/frontmatter.ts`:

```ts
visibility: z.enum(['public', 'preview']).optional().default('public'),
```

- Default `'public'` → no existing content file needs to change.
- `'preview'` → page is under review; public-invisible, reviewer-visible.
- Enum (not a boolean) so a future `'audience:x'`-style extension doesn't break
  the field's type.

The registry (`registry.ts`) already normalises raw frontmatter into the
resolved `Frontmatter` type — carry `visibility` through onto `ContentPage` so
every consumer can read it.

### 2. Preview-mode resolution (server, per request)

A `createServerFn` (pattern already used in `src/lib/send-feedback.ts`) owns the
token lifecycle. Conceptually:

- Read the `?preview=` search param and the existing `preview` cookie from the
  request (`@tanstack/react-start/server` request/cookie helpers — confirm exact
  API at implementation time, see Open questions).
- `?preview=<TOKEN>` where `<TOKEN>` equals `process.env.PREVIEW_SECRET`
  → set an httpOnly session cookie, then **redirect to the same path with the
  `preview` param stripped** (so the secret doesn't linger in URL/history).
- `?preview=exit` → clear the cookie and **redirect to `/`** (homepage). This
  also covers the case where the reviewer is currently *on* a preview page that
  would otherwise 404 the instant the cookie is gone.
- Otherwise → preview mode = "is the valid cookie present?".

Resolve this **once** in the root route (`__root.tsx`) `beforeLoad`, and put
`preview: boolean` into the router context (`MyRouterContext`). Because the root
loader's data is serialized to the client, `preview` is then available to child
loaders on the server *and* to client-side navigation and the search UI. (The
boolean is not a secret; only the token is.)

### 3. Effective visibility — preview inherits down the slug tree

Setting `visibility: preview` on a service page must also hide **everything that
hangs off it**: its markdown sub-pages (e.g. `<service>/start`) *and* its
dedicated form route (`<service>/form`). A sub-page is not public if its parent
is under review.

Define **effective visibility** in `registry.ts`:

> A page is *effectively preview* if its own `visibility === 'preview'` **or any
> ancestor page** (a slug prefix that is itself a page in `BY_SLUG`) is
> `preview`.

Walk the slug ancestors: for `calculate-severance-pay/start`, check the page
itself, then `calculate-severance-pay` (which is a page via `index.md`). This
reuses the same parent-slug lookup `isSubPage` already relies on. A sub-page may
also be independently flagged `preview` while its parent stays public.

Registry helpers to add:

- `isPreview(page): boolean` — ancestor-aware, per the rule above.
- `isVisible(page, preview): boolean` → `!isPreview(page) || preview`.
- `assertContentVisible(contentUrl, preview)` — used by the static form routes
  (§4): resolve the owning page via `findPage(contentUrl)` and `throw notFound()`
  when it is effectively preview and not in preview mode.

### 4. Gating the leak points

A page is **public-visible** iff `isVisible(page, context.preview)`. Apply it at
every surface that exposes a page or a thing hanging off it:

| File | Surface | Change |
|------|---------|--------|
| `src/routes/$.tsx` | page + sub-page resolution | after `findPage`, if `!isVisible(page, preview)` → `throw notFound()`. (Ancestor-aware `isPreview` is what makes `/start` 404 when its parent is preview.) |
| `src/routes/$.tsx` | category + subcategory `PAGES.filter(...)` lists | add `isVisible(p, preview)` |
| `src/routes/services.tsx` | services directory `PAGES.filter(...)` | add `isVisible(p, preview)` |
| `src/lib/search.ts` | MiniSearch index build (`for (const page of PAGES)` — currently indexes **all** pages incl. `/start`) | skip pages where `!isVisible(page, preview)`; the index must be built/branched with the `preview` flag so preview content never appears in public search |
| `src/routes/*.form.tsx` (×3) | static form routes — no registry link today | add a `beforeLoad` calling `assertContentVisible('<service-url>', context.preview)`; add `noindex` to `head()` when the owning page is preview |

The three form routes are
`business-trade.crop-over-permits.form.tsx`,
`money-financial-support.calculate-severance-pay.form.tsx`,
`pensions-and-gratuities.calculate-your-pension.form.tsx`. Each already hardcodes
its own URL, so each passes its owning service URL (its URL minus the trailing
`/form`) to `assertContentVisible`.

`Breadcrumbs.tsx` and `content/orgs.ts` only do label/href lookups, not
listings; once a page 404s for the public they cannot surface it, so no change
is needed there. (Verify `index.tsx` / any `featured` consumer during
implementation — see Open questions.)

### 6. Hiding the online method on a still-public parent page

When a page is public but its `/start` sub-page is `visibility: preview`, the
parent's "Request a copy online" item must disappear for the public and the
intro count must drop ("There are 2 ways" → "There is 1 way"). Token holders see
the full list.

**Reuse the existing `src/lib/rehype-hide-start-links.ts` plugin** — it already
removes a `<li>` that contains a start link *and* rewrites the
`/are (\d+|word) ways/` sentence by the number of items removed (handling the
"1 way" singular). What changes:

1. **Drive its gate from the preview token, renamed `inPreview`.** The plugin's
   existing `hasResearchAccess` option is dead code today (never set `true`
   anywhere) — rename it to `inPreview` and set it from `context.preview`: in
   preview mode → keep the online method; public → strip it. `$.tsx` `PageView`
   passes the flag into `<MarkdownContent>`, which already forwards it.
2. **Replace the blanket `/start` rule with a visibility-aware one.** Today the
   plugin strips *any* anchor whose `href` ends in `/start` and, deliberately,
   **never** strips a `data-start-link` CTA. In practice **all 33 online methods
   in the content are `data-start-link` and none use a plain `/start` link**, so
   the plugin's current strip path matches nothing — it is dead. Replace it with:
   *not in preview mode AND the anchor's normalised href is in the
   **effective-preview page-URL set** (from `PAGES` via `isPreview`, §3)* → strip
   the `<li>` and decrement the count. This:
   - leaves live online methods (their `/start` is `visibility: public`) in place;
   - correctly hides the birth-cert method, which *is* a `data-start-link` to a
     preview `…/start` (the old `data-start-link` exemption is dropped for
     preview targets);
   - covers both plain and `data-start-link` anchors uniformly.

This is **additive** to — and independent of — the existing build-time
form-manifest deferral. Today an online method's *button* is suppressed when the
page's `form_id` isn't in `available-forms.gen.ts` (`StartLinkFromContext`
returns `null`), but the `<li>` and the "N ways" text remain. §6 is what removes
the whole item and fixes the count, keyed on `/start` visibility. The manifest
axis is untouched, so nothing currently button-suppressed becomes exposed.

> ⚠️ This changes a tested plugin. Its current tests cover the (dead) blanket
> `/start` behavior and the `data-start-link` exemption; rewrite them to the
> visibility-aware rule with a `get-birth-certificate`-style fixture.

### 7. Crawler indexing + reviewer banner (`$.tsx`)

- In the route `head()`, when the resolved page is `preview`, add
  `{ name: 'robots', content: 'noindex' }`. Public pages stay indexable as they
  are today. (Belt-and-braces: a preview page is already unreachable publicly,
  but `noindex` protects against accidental link sharing.)
- In `PageView`, when the page is `preview`, render an **"Under review — not
  public"** banner. By construction this only ever renders for someone in
  preview mode, and only on preview pages — public pages and public visitors
  never see it.

## Scope

- [ ] Add `visibility` to `FrontmatterSchema`; carry it onto `ContentPage` in
      `registry.ts`.
- [ ] `createServerFn` for preview-token resolution (set on `?preview=<TOKEN>`,
      clear + redirect home on `?preview=exit`, strip token from URL on set).
- [ ] Resolve `preview` in `__root.tsx` `beforeLoad`; add to router context.
- [ ] Ancestor-aware `isPreview` + `isVisible` predicates and
      `assertContentVisible` in the registry.
- [ ] Apply `isVisible` in `$.tsx` (page resolution + lists), `services.tsx`,
      and `search.ts`.
- [ ] Gate the three `.form.tsx` routes via `assertContentVisible` in
      `beforeLoad`; add `noindex` to their `head()` when preview.
- [ ] Make `rehype-hide-start-links` visibility-aware (preview-URL set), drive
      its gate from `context.preview`, and pass the flag from `$.tsx` `PageView`
      through `MarkdownContent`. Rewrite its tests to match.
- [ ] `noindex` meta + "Under review" banner for preview pages in `$.tsx`.
- [ ] `PREVIEW_SECRET` documented in `apps/landing/.env.example`.
- [ ] Tests (below).

## Files

- `apps/landing/src/lib/frontmatter.ts` — add `visibility`.
- `apps/landing/src/content/registry.ts` — carry `visibility` onto `ContentPage`;
  add `isPreview` (ancestor-aware), `isVisible`, `assertContentVisible`.
- `apps/landing/src/lib/preview.ts` *(new)* — `createServerFn` token resolution.
- `apps/landing/src/routes/__root.tsx` — resolve preview in `beforeLoad`, extend
  `MyRouterContext`.
- `apps/landing/src/routes/$.tsx` — gating, `notFound`, `noindex`, banner; pass
  preview flag into `MarkdownContent`.
- `apps/landing/src/routes/services.tsx` — list filter.
- `apps/landing/src/routes/*.form.tsx` (×3) — `beforeLoad` gate + `noindex`.
- `apps/landing/src/lib/search.ts` — index filter (effective visibility).
- `apps/landing/src/lib/rehype-hide-start-links.ts` — visibility-aware hide rule;
  gate from preview state. Plus its test file.
- `apps/landing/src/components/MarkdownContent.tsx` — thread preview flag +
  preview-URL set to the plugin.
- `apps/landing/.env.example` — `PREVIEW_SECRET`.
- New test file(s) for the predicate and gating.

## Verify

- `pnpm exec nx run-many -t build` and `pnpm exec nx run-many -t test` green
  (per `CLAUDE.md`).
- Unit tests: `isVisible`/`isPreview` truth table (public/preview ×
  in-preview/not); ancestor inheritance — a `/start` sub-page is hidden when its
  parent `index.md` is `preview`, even with no flag of its own; a preview page
  and its sub-pages are excluded from category lists and the search index when
  not in preview mode and included when in it.
- Manual SSR check (use `calculate-severance-pay`, which has both a `/start`
  sub-page and a `/form` route):
  1. Mark `calculate-severance-pay/index.md` `visibility: preview`.
  2. As public, all of these return 404 / are absent from lists & search:
     the service page, `/.../calculate-severance-pay/start`, and
     `/money-financial-support/calculate-severance-pay/form`. Crawler sees
     `noindex` on any of them only if reached directly.
  3. Visit `?preview=<TOKEN>`: redirected to clean URL; the service page renders
     with the "Under review" banner, and `/start` and `/form` are reachable.
  4. Visit `?preview=exit`: redirected to `/`; all three 404 again.
  5. Flip the file to `visibility: public`: everything is live for everyone, no
     banner, indexable.
- Online-method check (use `get-birth-certificate`, parent public): mark
  `get-birth-certificate/start.md` `visibility: preview`. As public, the parent
  page renders "There is 1 way…" with the online "Request a copy online" item
  removed and only the paper method shown; `/start` & `/form` 404. With the
  token, the page shows "There are 2 ways…" incl. the online method, and `/start`
  resolves. Add a unit test on `rehype-hide-start-links` for both states using
  this fixture.

## Open questions

- **Exact TanStack Start request/cookie API** (`getWebRequest` / cookie helpers
  / redirect-from-server-fn) for v1.168 — confirm against the installed package
  before writing `preview.ts`.
- **`featured` / homepage:** confirm whether `index.tsx` (or any component
  reading `frontmatter.featured`) can surface a preview page; if so, add the
  predicate there too.
- **Token rotation / who holds `PREVIEW_SECRET`** — out of scope for the code,
  but the deploy/secret owner should be identified before this ships to prod.
- **Future audiences:** the `visibility` enum is the seam for later
  per-audience access; not built now.
