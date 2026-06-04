# 2026-06-04 — Field width hints: percentages → fixed `ch` measures

## Context

The passport number field on the textbook-grant form rendered extremely small
(~248px at 1440px). Investigation started as a question about the `long` width
hint apparently doing nothing; the real finding was that the field was `short`
(the registry's `passport-number` component ships `ui: { width: "short" }` and
the recipe doesn't override it) and the percentage-based width rules compounded
against every wrapper: `.form-width` 2/3 column × show-hide inset padding ×
33%. Issue #765.

## What we did

- Replaced the ≥768px percentage rules in `apps/forms/src/styles/govtech.css`
  with fixed caps: `short` → `max-width: 24ch`, `medium` → `max-width: 38ch`.
  Mobile (<768px) stays full width; `long`/no hint stays unstyled.
- Wrote [ADR 0034](../decisions/0034-field-width-hints-are-fixed-measure.md)
  establishing the convention: width hints are fixed-measure, never
  container-relative.
- Verified end-to-end with Playwright against the worktree's dev server and
  the local API: the inset passport field and a standalone `short` field now
  both render at exactly 312px desktop; mobile keeps full-width behaviour.

## Why we did it that way

- **Three fix altitudes were on the table:** override `ui` in the recipe
  (fixes one form), change the registry component default to `medium` (fixes
  one component, every placement), or stop using percentages (fixes the class
  of bug). We chose the structural fix because the compounding would bite any
  short/medium field inside any future wrapper — the inset was just the first.
- **`max-width` + the existing `width: 100%` floor** rather than a fixed
  `width`, so fields still shrink in genuinely narrow containers instead of
  overflowing.
- **`ch` over `rem`/`px`** so the caps follow the body type scale — a width
  hint describes content ("about this many characters"), and a token font
  change rescales fields for free. 1ch ≈ 13px at the current 20px Figtree
  body, so 24ch/38ch ≈ 312/494px — chosen to sit near the old standalone
  desktop sizes (~260/395px), slightly wider.
- **Mobile kept full-width below 768px** (user's explicit call) — GOV.UK caps
  on mobile too, but the existing mobile behaviour was fine and not part of
  the complaint.
- **No automated width regression test** (user's call): the e2e suite targets
  deployed environments and a pixel-comparison assertion is brittle; the ADR
  plus the CSS comment carry the intent.

## What we almost got wrong

- Nearly diagnosed this as "`long` is broken." `long` has no CSS rule on
  purpose; the broken part was percentage maths on `short`. A fix aimed at
  `long` would have missed the bug entirely.
- Verification machinery had sharp edges worth knowing: the worktree needed
  its own `pnpm install`; the local API's CORS allowlist only admits the
  user's own dev origin, so the worktree dev server proxied
  `/form-definitions` instead; the vite dev run regenerated
  `routeTree.gen.ts`, which had to be reverted out of the diff.

## Open questions

- The builder UI may present width choices without making clear that a
  registry component (like `passport-number`) carries its own default — the
  user initially believed the field was `long`. Possibly worth a builder
  affordance; not filed.
