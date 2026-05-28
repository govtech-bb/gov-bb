# Content feature flagging for landing

## Context

`apps/landing` needed gradual content rollout: hide a page (or its digital
service) from the public while reviewers check it, then publish by flipping a
flag. The app is TanStack Start SSR with no auth and all content bundled at
build time. Planned in `docs/plans/content-feature-flagging.md`.

## What we did

- Added `visibility: public | preview` frontmatter (`src/lib/frontmatter.ts`),
  defaulting to `public`.
- Registry helpers (`src/content/registry.ts`): `isPreview` (ancestor-aware),
  `isVisible`, `isUrlPreview`, `startSubPageInPreview`, plus the pure
  `resolveIsPreview` core.
- Preview-token plumbing (`src/lib/preview.ts`): a `createServerFn` reads
  `?preview=<PREVIEW_SECRET>` → httpOnly cookie + redirect to the clean URL;
  `?preview=exit` clears it. Resolved once in `__root.tsx` `beforeLoad` into
  router context.
- Gating applied in `$.tsx` (page 404 + listings), `services.tsx`, `search.ts`,
  and the three `.form.tsx` routes; `noindex` + "Under review" banner on preview
  pages.
- Reworked `rehype-hide-start-links.ts` to hide the online-application method
  and rewrite the "N ways" count when a public page's `/start` is in preview.
- Decision recorded in
  `docs/decisions/0013-content-preview-is-a-rollout-gate-not-a-confidentiality-boundary.md`.

## Why we did it that way

- **Runtime gate, not build-time exclusion.** Chosen because the user accepted
  "hidden, not secret" — preview content can ship in the bundle. This kept the
  design to one artifact for all environments and avoided standing up auth. The
  cost (content is technically downloadable) is the subject of ADR 0013.
- **Shared token over per-user auth or environment gating.** The user wanted
  reviewers to preview on *any* environment including prod, controlled by a
  secret rather than a staging URL — so an httpOnly token cookie, not accounts
  and not "show on staging only".
- **Two-level semantics.** A late requirement: a *public* page whose `/start`
  sub-page is preview must still render, but with its online method stripped and
  "2 ways" → "1 way". So `preview` on `index.md` hides the whole page, while
  `preview` on a sub-page hides that route *and* trims the parent. `isPreview`
  walks slug ancestors so flagging a parent cascades to `/start` and `/form`.
- **Slug-based online-method hiding (deviation from the plan).** The plan said
  match authored hrefs against a preview-URL set. Orientation showed sub-page
  URLs are inconsistent — most `/start` files omit the category prefix, so they
  resolve at a bare URL — but the *slug* is always `<parent>/start`. So the
  route computes `startSubPageInPreview(page)` by slug and passes one boolean to
  the rehype plugin, instead of fragile href matching.
- **Reused the existing rehype plugin.** It already did `<li>` removal + the
  "N ways" rewrite, gated on a dead `hasResearchAccess` flag. We renamed that to
  `hideStartLink` and retargeted it at `data-start-link` CTAs (the plugin had
  previously *exempted* those and only touched plain `/start` links — of which
  the content has none, so that path was dead).
- **Root `beforeLoad` for preview state.** Resolved once server-side so the
  boolean rides the dehydrated context across client navigations, avoiding a
  per-navigation server round-trip for the cookie read.

## What we almost got wrong

- Initially assumed the rehype plugin currently hides online methods across the
  board, which raised a "migration audit" worry (default `public` would expose
  not-ready forms). Reading the code showed all 33 methods are `data-start-link`
  and the plugin never touched those — gating is actually done by the build-time
  form manifest, which this change leaves alone. The change is purely additive;
  the audit worry was dropped.
- The pointer said `apps/web/src/content`, but `apps/web` was renamed to
  `apps/forms` and the real target is `apps/landing`.

## Verification

Unit tests for `resolveIsPreview`, `decidePreview`, the rehype transform, and
route-level gating (mocked registry). Plus a live SSR + browser walkthrough on
`get-birth-certificate` (parent public, `/start` preview): public sees "1 way"
with the online method removed and `/start` 404; the token restores "2 ways" and
the method, shows the banner + `noindex` on `/start`, and `exit` clears it.

## Open questions

- `vite.config.ts` has pre-existing type errors against the `nitro` 3 beta
  (`nitro/vite` subpath / `NitroPluginConfig.config`). Surfaced once deps were
  installed; unrelated to this work. CI gates on build+test (both green), not
  typecheck.
- Whether root `beforeLoad` truly runs only once per full load (assumed, not
  re-verified). If it re-runs per client navigation it's still correct, just an
  extra cheap server round-trip.
