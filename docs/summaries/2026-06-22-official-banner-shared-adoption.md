# Adopt shared `@govtech-bb/react` OfficialBanner across three apps (#1389)

## Context

Issue #1389 (audit ID `LIB-01`) flagged that the "Official government website"
banner — blue strip + coat-of-arms image + caption — was implemented three
times even though `@govtech-bb/react` already exports an `OfficialBanner`
component. `apps/forms` and `apps/landing` had byte-for-byte-identical local
`OfficialBanner.tsx` files; `apps/chat` inlined the same markup inside
`SiteHeader` in `chrome.tsx`, and had already drifted — it used a different
asset path (`/coat-of-arms.png` vs the others' `/images/coat-of-arms.png`) and
design-token spacing (`gap-xs`/`py-xs` vs `gap-2`/`py-2`).

This is PR1 of the two-PR plan `docs/plans/1389-lib-react-banner-and-fieldrenderer.md`.
PR1 (banner) is the low-risk path-validation step; PR2 (FieldRenderer, #1390)
is the large surface and remains a separate session.

Worked on branch `worktree-lib-react-official-banner` (targets `sandbox`).

## What we did

- `apps/forms/src/routes/__root.tsx` — import `OfficialBanner` from
  `@govtech-bb/react` instead of the local module; deleted
  `apps/forms/src/components/official-banner.tsx`.
- `apps/landing/src/components/Header.tsx` — same swap; deleted
  `apps/landing/src/components/OfficialBanner.tsx`.
- `apps/chat/src/components/chat/chrome.tsx` — replaced the inlined banner block
  in `SiteHeader` with the shared component; dropped the now-unused `Text`
  import.
- `apps/forms/src/routes/__root.spec.tsx` — the spec mocked the local banner
  module; rewired it to mock `OfficialBanner` from `@govtech-bb/react`, and
  added a prop-wiring assertion (`imageSrc`/`imageAlt=""`/`showLearnMore=false`).

All three call sites pass the same props:
`imageSrc="/images/coat-of-arms.png"`, `imageAlt=""`, `showLearnMore={false}`.

## Why it looks this way

- **`showLearnMore={false}` is deliberate, not cosmetic.** The shared component
  defaults `showLearnMore` to **`true`**, which renders a `<a href="#">Learn
  more</a>` link — a dead anchor none of the three local copies ever had.
  Reading the compiled component (`dist/index.js`) caught this before it
  shipped; every call site disables it to preserve prior behaviour.
- **`imageAlt=""` keeps the image decorative.** The package defaults `imageAlt`
  to `"Government of Barbados"`, but all three locals used `alt=""` — the
  adjacent "Official government website" text already conveys the meaning, so a
  non-empty alt would be redundant for screen readers. The shared component
  drops the old `aria-hidden="true"`, but an empty `alt` already marks the image
  decorative, so this is equivalent — no a11y regression.
- **No asset files were moved.** The asset path was the plan's open question
  (chat diverged). It resolved itself: `apps/chat/public/images/coat-of-arms.png`
  already existed (chat's Footer `logoSrc` uses it), so all three apps could
  standardise on `/images/coat-of-arms.png` with zero file moves. Chat's root
  `/coat-of-arms.png` was intentionally left in place — `markdown.tsx` citation
  chips still reference it; only the banner moved.
- **Full-bleed is now owned by the design system.** The shared component wraps
  its content in `px-4` rather than the locals' `.container`, so the banner
  strip is full-width instead of aligned to the page container. This is an
  intentional consequence of adopting the design-system component (visual-only,
  not a functional change) and was flagged for a manual spot-check.

## Verification

- `nx run forms:test` — 741 passed, including the new banner-wiring assertion.
- `nx run-many -t test --projects=chat,landing` — passed.
- `nx run-many -t build --exclude=landing,cms` — 13 projects built (landing
  excluded per the offline-prebuild caveat; CI builds it).
- `tsc -b` — clean (spec type-check, not covered by nx build).
- Code-reviewer subagent over the diff: 0 correctness/security/reuse/convention
  findings.
- **Not** verified: a live visual render of the three banners (the full-bleed
  layout change) — left for a manual eyeball.
