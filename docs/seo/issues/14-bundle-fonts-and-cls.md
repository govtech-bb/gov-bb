# Entry bundle weight, font loading and layout shift

## Problem

- The entry chunk is 2.28 MB raw / 401 KB compressed because
  `content/registry.ts` eagerly imports the compiled markdown (frontmatter,
  body and hast) of every page, including preview and draft pages. About
  670 KB of the raw size is hast `position` data that nothing reads.
- Figtree is self-hosted with `font-display: swap` and no preload.
  Lighthouse measured CLS 0.156 on `/business-trade/apply-for-food-business-licence`
  and `/bank-holiday-calendar` (mobile); the shifting node is the h1 + "Last
  updated" block, consistent with the fallback-to-Figtree swap changing line
  breaks on long headings.
- Render-blocking CSS costs ~300 ms; ~23 `modulepreload` links per page.

- Lab observation (local, both old and new builds): `/business-trade` reaches
  first paint ~2 s later than the home page or a service page with the same
  server response time and the same render-blocking CSS (FCP 3.5 s vs 1.3 s).
  Something specific to the category route delays first paint; worth a trace
  before touching fonts or bundles.

- Measured with a layout-shift observer on the local build: the 0.156–0.173
  CLS on every page is the header, not fonts or images. The server renders
  the menu button `hidden` and the nav collapsed, but the DS CSS only honours
  the collapsed state once React stamps `data-govbb-header-enhanced` after
  hydration, so the full nav (148 px) paints first and then disappears.
  GOV.UK avoids this with an inline `js-enabled` script at the top of `<body>`
  and CSS gated on that class; the same gate belongs in `@govtech-bb/frontend`.

## Impact

Mobile FCP ~4 s and TBT up to 60 ms on a 73 % mobile audience; CLS above the
0.1 "good" threshold on two of five sampled pages.

## Where

- `apps/landing/vite-plugin-markdown.ts:20` (hast serialisation)
- `apps/landing/src/content/registry.ts:73` (eager glob)
- `apps/landing/src/routes/__root.tsx` links (font preload)
- `@govtech-bb/frontend` `src/fonts.css` (font-face; design-system scope)

## Fix

1. One line, zero risk: `JSON.stringify(hast, (k, v) => (k === 'position' ?
undefined : v))` in `vite-plugin-markdown.ts`. Rebuild and measure.
2. Preload the latin roman Figtree face from `__root.tsx`:
   `import figtreeUrl from '@govtech-bb/frontend/assets/fonts/figtree-latin.woff2?url'`
   and `{ rel: 'preload', as: 'font', type: 'font/woff2', href: figtreeUrl,
crossOrigin: 'anonymous' }`; verify the href equals the `@font-face` URL in
   the built CSS.
3. If CLS persists: ask the design system for a metric-compatible fallback
   (`size-adjust`/`ascent-override` on a local fallback face) or
   `font-display: optional` for headings.
4. Only if Lighthouse still says so after 1–2: split the glob so `hast` loads
   per page (non-eager import awaited in the `$.tsx` loader), keeping
   frontmatter and search bodies eager.

## Acceptance criteria

- Entry chunk raw size below 1.6 MB after step 1 (measured in
  `.amplify-hosting/static/assets/`).
- CLS < 0.1 on the two affected pages in Lighthouse mobile.
- Font preload present and matching the CSS URL; no duplicate font download.

Suggested labels: `enhancement`, `severity:minor`, `area:frontend`, `subsystem:landing`
