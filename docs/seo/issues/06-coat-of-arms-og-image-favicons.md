# Coat of arms image is 1.14 MB on every page; og-image 401 KB; no ≥ 48 px favicon

## Problem

`apps/landing/public/images/coat-of-arms.png` is 1,144,301 bytes at 1920×2064.
It is rendered at 24 px tall in the official banner and 112 px in the footer
on every page, referenced as the Organization logo in JSON-LD, and
auto-preloaded by React 19 because it is a server-rendered `<img>`. It is
1,120 KB of the ~1,700 KB each page transfers. Lighthouse: "image delivery —
1,116 KiB savings", "unsized images".

`public/og-image.png` is 401 KB at 2400×1260. The only icon is a 16/32 px
`favicon.ico`; Google requires a square icon of at least 48×48 to show a
favicon in mobile results, and there is no `apple-touch-icon` or `<link
rel="icon">`.

## Impact

Mobile Lighthouse performance 65–73 on service and topic pages (desktop 89–99);
mobile LCP 4.6–14.4 s; on short pages the footer image competes for LCP.
No favicon in mobile SERPs where every competitor shows one.

## Where

- `apps/landing/public/images/coat-of-arms.png` (file)
- References: `apps/landing/src/components/Header.tsx:27` (`OfficialBanner
imageSrc`), `apps/landing/src/routes/__root.tsx` footer (`coatSrc`),
  `apps/landing/src/lib/structured-data.ts:31` (logo)
- `apps/landing/public/og-image.png`, `public/favicon.ico`, `public/manifest.json`
- `apps/landing/src/routes/__root.tsx` `links`

## Fix

Status 2026-09-24: an uncommitted change on `main` implements this. All brand
assets are landing-owned files under `apps/landing/public/` so they can be
optimised or replaced without a design-system release: `images/govbb-crest.svg`
(the 564 KB master, to be swapped for the screen version from the brief below),
`images/govbb-logo.svg` (svgo-optimised, 8.8 KB, pixel-identical), the icons
on their conventional root names, a static `manifest.json`, and `og-image.png`
at 1200×630 / 75 KB. Header, footer and the JSON-LD logo reference `/images/…`
paths; nothing is imported from `@govtech-bb/frontend/assets` any more.
`-brand-assets.test.tsx` byte-compares the icons with the package, checks the
og-image and logo budgets, and the root links. Build, typecheck and tests pass
locally; not deployed yet. Intrinsic `width`/`height` and `loading`/`fetchPriority`
on the crest wait for the design-system release that adds the props (branch
`feat/brand-image-intrinsic-size`: `imageSrc`/`imageWidth`/`imageHeight` on
Footer and OfficialBanner, `logoWidth`/`logoHeight` on Header). No pnpm patch is
carried.

1. Constraint: the crest must not lose quality, so the replacement is the
   vector `govbb-crest.svg` from `@govtech-bb/frontend` (564 KB raw, ~208 KB
   gzip, ~19 % smaller after lossless `svgo --multipass`), used by the banner,
   the footer and the JSON-LD logo. Keep the bytes off the critical path
   instead of shrinking the artwork: run `svgo` on the package asset
   (lossless), let the CDN serve it brotli-compressed like the other hashed
   assets, and mark the footer instance `loading="lazy"` /
   `fetchPriority="low"` so React 19 stops preloading it ahead of the LCP
   resources (the 24 px banner instance can stay eager). A pixel-exact 2×
   raster for the two rendered sizes would be smaller still, but only if the
   team accepts a raster at those sizes.
2. Re-export `og-image.png` at 1200×630, ≤ 120 KB.
3. Add to `public/`: `favicon-96x96.png`, `apple-touch-icon.png` (180×180),
   `icon-192.png`, `icon-512.png`; reference them from `manifest.json`.
4. `__root.tsx` links: `{ rel: 'icon', href: '/favicon.ico', sizes: '32x32' }`,
   `{ rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' }`,
   `{ rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }`.
5. Ask the design system to accept `width`/`height` on the banner and footer
   images (unsized-images) — outside this repo's landing scope.

## Measured locally (2026-09-24, Lighthouse 13.5 mobile, both builds served

Amplify-style on this machine; absolute numbers are inflated by a ~1.7 s local
server response because the forms API is unreachable, so compare rows, not to
prod)

| Page                                           | Before (HEAD)           | After (this change)   |
| ---------------------------------------------- | ----------------------- | --------------------- |
| `/`                                            | 92, LCP 1.1 s, 1,559 KB | 93, LCP 1.3 s, 632 KB |
| `/business-trade`                              | 70, LCP 4.3 s, 1,554 KB | 71, LCP 4.1 s, 627 KB |
| `/family-birth-relationships/register-a-birth` | 65, LCP 4.4 s, 1,560 KB | 88, LCP 1.3 s, 634 KB |

Transfer drops ~59 % on every page (the 1,118 KB PNG becomes a 188 KB
brotli'd SVG). The score moves only where the coat of arms was the LCP
element (content pages with the footer in the first viewport); main-thread
time is unchanged (1.2 s vs 1.1 s on the home page), so the vector crest costs
no measurable CPU at these sizes. CLS stays at 0.156 on every page in both
builds: that is the font swap (issue 14), not the images.

## What GOV.UK Frontend does with the same images (reference for the banner and footer)

|                       | GOV.UK Frontend                                                                                                                                                                                                                      | alpha.gov.bb today                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Header logo           | Inline `<svg>` (crown + logotype, ~5 KB of markup) with explicit `width`/`height`/`viewBox`; no request, no preload, no shift                                                                                                        | `govbb-logo.svg` as `<img>`: 19 KB, 22 paths, no intrinsic size                                     |
| Footer crest          | `govuk-crest.svg`, **35 KB, 25 paths**, drawn for screen (125×102), applied as a CSS background on the copyright link inside a box reserved with `min-width`/`padding-top`; never an `<img>`, so never preloaded or an LCP candidate | `govbb-crest.svg` master as `<img>`: **564 KB raw, 369 paths, 188 KB brotli'd**, rendered at 112 px |
| Small crown in footer | Same inline SVG as the header, `useLogotype: false`                                                                                                                                                                                  | Same 564 KB crest as `<img>` at 24 px in the official banner                                        |
| Icons / OG            | favicon.ico 6 KB, favicon.svg 1.8 KB, 180/192/512 PNGs 2.7–8.8 KB, OG 17 KB                                                                                                                                                          | 15 KB / 0.8 KB / 2.4–11.7 KB / 75 KB — comparable                                                   |

The lesson is not "raster instead of vector": GOV.UK keeps vectors everywhere,
but the vector used on screen is a purpose-drawn screen version of the arms,
and the two brand marks are inlined or CSS backgrounds with reserved boxes.

### Image-only plan, in order of effect

1. **Screen crest asset (design task).** A screen-optimised SVG of the coat of
   arms, target ≤ 40 KB and a few dozen paths (GOV.UK's is 35 KB / 25 paths),
   shipped in `@govtech-bb/frontend` next to the print master. Lossless `svgo`
   on the master only reaches 456 KB, so this needs a redraw, not a tool. Cuts
   ~175 KB from every first visit and removes the last big image from the
   critical path.
2. **Banner crest (24 px).** Once a small screen version exists, inline it in
   `OfficialBanner` as `<svg>` with `width`/`height` (GOV.UK's header pattern):
   no request, no preload, no shift. Until then, `<img>` with intrinsic
   `width`/`height` (DS props on `feat/brand-image-intrinsic-size`).
3. **Footer crest (112 px).** CSS background with a reserved box, or `<img
loading="lazy" width height>` — both keep it off the preload list and out of
   LCP on short pages. The DS branch delivers the second form.
4. **Header logo.** `svgo` the 19 KB logo; inline it if it lands under ~6 KB
   like GOV.UK's, otherwise `<img>` with `logoWidth`/`logoHeight` (on the
   branch).

Expected effect: image bytes per page from ~205 KB compressed to ~20 KB, no
image in the preload chain, and LCP on short pages no longer gated by the
footer image. The remaining mobile score gap is not the images (see issue 14
for the header collapse and font work).

### Lossless optimisation results (2026-09-24)

| Asset             | Before                             | `svgo --multipass`             | Renders identically?                                                                                                         |
| ----------------- | ---------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `govbb-logo.svg`  | 19,241 B (7.4 KB gzip), 22 paths   | 8,838 B (3.3 KB gzip), 2 paths | Yes: 21 of 29,808 pixels differ at 2×, anti-aliasing only. **Applied** on the DS branch.                                     |
| `govbb-crest.svg` | 564,263 B (208 KB gzip), 369 paths | 455,662 B (189 KB gzip)        | **No**: 48 % of pixels differ; `svgo` breaks the master's rendering. Not applied; the screen redraw below is the only route. |

### Design brief: screen version of the coat of arms

- **Why:** the current `govbb-crest.svg` is the print master (564 KB, 369
  paths; 456 KB / 189 KB gzip after lossless `svgo`). It is drawn twice on
  every page at 24 px and 112 px, where none of that detail can be seen.
  GOV.UK ships a 35 KB / 25-path screen version of the royal arms for the same
  job and keeps the master for print.
- **Deliverable:** `govbb-crest-screen.svg` in `@govtech-bb/frontend/assets/images/`,
  same proportions as the master (887.2 × 953.525 viewBox, 0.93 aspect), flat
  fills, no gradients or filters, ≤ 40 KB raw before `svgo`, ideally ≤ 60
  paths. Must read correctly at 24 px (banner), 48 px, 112 px (footer) and
  224 px (2× footer). Colours from the DS tokens.
- **Optional:** a 24-px simplified mark (≤ 3 KB) for the official banner so it
  can be inlined like GOV.UK's crown.
- **Acceptance:** side-by-side with the master at 24 / 112 / 224 px shows no
  visible difference at 1× and 2× DPR; `svgo --multipass` output ≤ 40 KB; the
  print master stays untouched for print stylesheets and downloads.
- **Then in code:** `OfficialBanner` and `Footer` point at the screen file (or
  inline the 24-px mark); the JSON-LD `logo` can keep the master.

## Acceptance criteria

- Transfer for `/` on mobile drops from ~1,700 KB to under 900 KB; Lighthouse
  mobile performance ≥ 85 on `/business-trade` and a service page; the crest
  is no longer the LCP element on short pages.
- The crest is served compressed at ≤ ~210 KB with no loss of quality, with
  intrinsic `width`/`height` on both `<img>`s; JSON-LD logo still validates.
- `<link rel="icon" sizes="96x96">` and `apple-touch-icon` present on every
  page; Rich Results Test shows the logo.

Suggested labels: `enhancement`, `severity:important`, `area:frontend`, `subsystem:landing`
