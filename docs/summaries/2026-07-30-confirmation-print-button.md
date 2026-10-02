# Session summary — Print button on the submission confirmation (#2132)

**Date:** 2026-07-30 · **Branch:** `feat-confirmation-print-button-2132` (off `main`) · resolves #2132

## What shipped

A "Print" button on the submission-confirmation page (between "What happens
next" and the feedback section), plus a print stylesheet that turns the page
into a clean paper copy.

- `submission-confirmation.tsx` — a native `<button className="govbb-btn--secondary">Print</button>`
  (wrapped in `form-page__print`) in the shared `trailingSections`, so it shows
  on both success states and none of the processing / submission-failed /
  payment-failed states (that fragment is already gated behind
  `paymentSuccess || isSafePaymentUrl(paymentUrl)`).
- `govtech.css` — the forms app's first `@media print` block.
- `__root.tsx`, `site-header.tsx` — `no-print` class on the header, footer, and
  the two top banners.
- `submission-confirmation.spec.tsx` — presence/absence, click, keyboard/name,
  and an axe audit.

## Why it looks the way it does

- **Chrome is hidden via a `no-print` class, not by targeting design-system
  selectors.** The first cut targeted `.govbb-header` / `.govbb-footer` in the
  print CSS — but those classes don't exist. Inspecting the live DOM showed the
  real header is `<header class="relative bg-yellow-100">` and the footer
  `<footer class="bg-blue-100">` (Tailwind utilities, no `govbb-` hooks), so the
  print rule matched nothing and the chrome still printed. Fix: the design-system
  `<Header>`/`<Footer>` accept a `className` (`extends HTMLAttributes`) and
  forward it to their root, so a `no-print` class is threaded through them (and
  wrapped around the banners) and hidden via `@media print { .no-print { … } }`.
  Verified live: header/footer go `display: block → none`.

- **The success banner is flattened in print.** `.form-page__panel--success` is
  a 16.75rem-tall teal block; print drops background colours, so it printed as a
  big empty gap. The print block collapses its height, drops the background, and
  forces dark text.

- **Consistent rhythm across both variants.** On-screen page gutters and the
  fixed two-thirds column leaked into print and made the payment vs non-payment
  layouts look different. Print now zeroes the container gutters, goes full
  width, and gives every confirmation block one uniform `margin-top`.

- **All action controls are hidden in print.** `.govbb-btn` / `[class*="govbb-btn"]`
  (plus the Print and feedback controls) — the Print button, feedback link,
  "Continue to payment" and "Try again" are useless on paper. This also removed
  a stray "Continue to payment" box that was printing on the payment variant.

- **Page breaks keep blocks whole.** `break-inside: avoid` on the submission ID,
  contact block, each payment row and each next-steps item; `break-after:
  avoid-page` on headings so a heading can't be orphaned at a page bottom.

- **Accessibility is a plain native button.** Visible "Print" text is the
  accessible name (no `aria-label`, which would risk a WCAG label-in-name
  mismatch); a native button is keyboard-reachable by default. Locked by an
  exact-name role query, a focus assertion, and an axe audit.

## Verification

- `nx run forms:test` green; `submission-confirmation.spec.tsx` 44 tests
  (presence on 2 success states, absence on 3 non-success states, click fires
  `window.print`, keyboard/name, axe no-violations).
- Live DOM inspection confirmed the `no-print` chrome hiding under print rules.
- `nx run forms:build` compiles.

## Follow-up: page breaks were silently broken (flex-item gotcha)

The first cut's page-break rules didn't actually work — printed content still
split mid-block. Root cause: **`break-inside: avoid` is ignored by Chrome on
flex children**, and the confirmation is built from flex columns
(`.form-page__confirmation` wraps every block; the payment card, contact panel
and lead panel are flex too), so every page-break rule silently no-op'd.

Fix — modelled on the landing app's StormReady checklist, which documents the
same gotcha: flatten those containers to `display: block` inside `@media print`,
so the browser honours the existing `break-inside` / `break-after` rules. Also
made the Print wrapper's `form-page__print` class unconditional (it had been
gated on `hasPayment`, so the non-payment print lost its consistent spacing).

Verified live: the print flatten rule flips `.form-page__confirmation` from
flex to block; `submission-confirmation.spec.tsx` 46 tests pass.
