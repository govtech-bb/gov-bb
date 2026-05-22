# Bank-holiday year switcher — Umami analytics events

Resolves [#66](https://github.com/govtech-bb/gov-bb/issues/66) — _Bank holiday
calendar: no Umami analytics events_.

## Goal

Emit Umami click events when users navigate years on `/bank-holiday-calendar`,
so the team can see which years users actually browse to (current,
next-after-current, or historical).

Pageviews are already auto-tracked by the router subscription in
`apps/landing/src/router.tsx` — this change only adds per-element events for
the interactive surfaces that currently emit nothing.

## Approach

Add `data-umami-event` and `data-umami-event-year` attributes to the two
TanStack `<Link>` elements inside `YearSwitcher`
(`apps/landing/src/routes/bank-holiday-calendar.tsx:178-215`):

- Previous-year link → `data-umami-event="bank-holiday-year-prev"` with
  `data-umami-event-year={String(prevYear)}`.
- Next-year link → `data-umami-event="bank-holiday-year-next"` with
  `data-umami-event-year={String(nextYear)}`.

The disabled `<span aria-disabled>` variants (at MIN/MAX year) don't navigate
and don't need analytics attributes.

`YearSwitcher` is rendered twice on the page (top and bottom of
`BankHolidaysPanel`), so the attributes apply to both instances automatically.

### Convention compliance

- Event names follow the per-surface `<surface>-<action>` pattern documented in
  `apps/landing/README.md`. ADR-0004 explicitly exempts `apps/landing` from the
  fixed-enum rule, so this naming is on-pattern.
- The declarative `data-umami-event` attribute on a clickable element matches
  existing precedent (`Breadcrumbs.tsx` already attaches the same attribute to
  TanStack `<Link>` components).
- Target year goes in event *data* (`data-umami-event-year`), not in the event
  name, so Umami's dashboard stays clean.

### What's deliberately out of scope

- **The `<details>` "Read the full rules" toggle.** The issue marks this as
  *optional*. Skipping it: the element is `open` by default, so an
  `onToggle`-based event would primarily measure re-expansion rather than the
  literal "user expanded the rules" intent the event name suggests. If
  product later wants this signal, the disclosure's default state should be
  rethought first.
- **Tests for analytics emission.** No precedent in the codebase for testing
  Umami calls; the existing convention is for declarative `data-umami-event`
  attributes to be visible in the rendered DOM and verified manually via the
  Umami dashboard. Out of scope here.

### Alternatives considered

- **Use `trackEvent()` in a click handler instead of `data-umami-event`
  attributes.** Rejected — `data-umami-event` is the declarative pattern
  already used by `<Link>`-style navigation events (`Breadcrumbs.tsx`,
  `Header.tsx`). `trackEvent()` is reserved for state transitions
  (`FeedbackForm.tsx`, search submit) where there's no DOM element to tag.

## Scope

- Add `data-umami-event` and `data-umami-event-year` to the two `<Link>`
  elements in `YearSwitcher`.

## Files

- `apps/landing/src/routes/bank-holiday-calendar.tsx` — add four attributes
  total (two per `<Link>`).

## Verify

1. Static: read the rendered JSX and confirm both `<Link>` elements carry the
   correct attribute pairs.
2. Unit tests pass: `pnpm --filter @govtech-bb/landing test`.
3. Runtime (pre-merge, needs Umami-enabled environment): open
   `/bank-holiday-calendar`, click Previous and Next, confirm
   `bank-holiday-year-prev` and `bank-holiday-year-next` events appear in
   Umami with the target year as a `year` property.

## Branching

Branch off `dev` as `fix/bank-holiday-analytics`. Use `fix/` because this
restores missing analytics on an existing page, not a new feature.

## Open questions

None.
