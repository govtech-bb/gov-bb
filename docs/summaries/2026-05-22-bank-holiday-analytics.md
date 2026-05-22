# Bank-holiday year switcher analytics — Session Summary

**Date:** 2026-05-22
**Branch:** fix/bank-holiday-analytics
**Resolves:** [#66](https://github.com/govtech-bb/gov-bb/issues/66)

## What was built

Added Umami click tracking to the year switcher on `/bank-holiday-calendar`. The Previous and Next `<Link>` elements now emit `bank-holiday-year-prev` and `bank-holiday-year-next` events with the target year as a `year` property, so the team can see which years users browse to.

## Why the diff is so small

The page already had no analytics at all (no `data-umami-event` attributes, no `trackEvent` calls). The fix is purely additive: four attributes on two `<Link>` elements. No refactoring, no new tests, no new dependencies.

## Why these names and shape

`apps/landing/README.md` documents two patterns:

- **Declarative `data-umami-event`** attributes on click targets — used by `Header.tsx`, `Breadcrumbs.tsx`, `MarkdownContent.tsx`, `MinistryPage.tsx`.
- **Imperative `trackEvent()`** calls from handlers — used by `FeedbackForm.tsx` and `index.tsx` for state transitions.

The year switcher is a navigation click, so the declarative pattern matches. `Breadcrumbs.tsx` already proves TanStack `<Link>` passes `data-umami-event` through to the underlying anchor, so no wrapper or workaround was needed.

The names follow the `<surface>-<action>` convention from the README. ADR-0004 explicitly exempts `apps/landing` from the fixed-enum naming rule that applies to `apps/forms`, so per-surface names are on-pattern. The target year is stored in event *data* (`data-umami-event-year`) rather than embedded in the name, keeping Umami's dashboard small.

## Why the disclosure was skipped

The issue marks the `bank-holiday-rules-expand` event as **optional**, and we took the option to skip it. The reason is a subtle one worth recording: the `<details>` element in `SubstitutionNotice` has `open` hard-coded in JSX, so it renders expanded on first load. An `onToggle` handler would fire when the user *collapses* the disclosure and again when they re-expand — meaning the event would primarily measure re-expansion, not the literal "user expanded the rules" intent the name implies.

The lead has already confirmed the disclosure should stay open by default (UX decision), so the only honest options were (a) ship the event with a misleading name, (b) ship two events (`-expand`, `-collapse`), or (c) skip it for now. Skipping was simplest and matches the "optional" marker in the issue. The reasoning lives in this summary and in the commit message rather than as a code comment, so future maintainers searching for "bank-holiday-rules" will find it through git history.

## Why no tests were added

The codebase has no precedent for testing Umami emission. The existing convention is to rely on:

1. Reviewing the rendered DOM has the `data-umami-event` attribute (which TypeScript and a quick code read both verify).
2. Verifying events in the Umami dashboard manually after deploy.

Inventing a test pattern for one PR would be off-spec. If product wants automated coverage for analytics later, that's a cross-cutting decision worth its own ADR.

## Verification

- `pnpm test` from `apps/landing` — 55/55 pass (5 files).
- Static diff review: four attribute additions match plan exactly.
- Runtime verify deferred to pre-merge (needs `VITE_UMAMI_WEBSITE_ID` in env to load Umami).
- Pre-existing typecheck/lint environment failures (vite.config.ts NitroPluginConfig, missing `@tanstack/eslint-config`) — same as previous session, unrelated to this change.

## Key files

| File | Change |
|------|--------|
| `apps/landing/src/routes/bank-holiday-calendar.tsx` | Four `data-umami-event*` attributes on `YearSwitcher` `<Link>` elements |
| `docs/plans/bank-holiday-analytics.md` | New — plan doc for the change |
