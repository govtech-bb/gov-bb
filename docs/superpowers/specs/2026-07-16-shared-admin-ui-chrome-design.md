# Shared admin UI chrome — bring the analytics design system to feature_flagging

**Date:** 2026-07-16
**Status:** Approved, pre-implementation

## Goal

Give `apps/feature_flagging` the same branded look as `apps/analytics` by adopting
the Government of Barbados design system (`@govtech-bb/design` tokens +
`@govtech-bb/react` components + Figtree), and extract the reusable site-header
chrome into a new shared workspace package, `@govtech-bb/admin-ui`, that both
apps *can* consume.

Scope decisions (confirmed with the requester):

- **Whole feature_flagging UI** moves onto the design system — `app.css`'s
  hand-written rules are retired, not just the header + login.
- **Analytics is left untouched** for now. The shared package is authored so
  analytics can adopt it later, but this change does not modify analytics.
- Shared package scope/name: **`@govtech-bb/admin-ui`** (matches the repo's
  existing `@govtech-bb/*` convention).

## Key findings

1. Analytics' visual identity is entirely the published design system. Its CSS
   (`apps/analytics/src/styles.css`) imports Figtree, `tailwindcss`, and
   `@govtech-bb/design`, `@source`s `@govtech-bb/react`'s dist for class names,
   and defines a shared `.container` utility + a Figtree `@theme`.
2. Analytics' local `GovbbLogo` is **byte-for-byte identical** to the design
   system's `Logo` (`viewBox="0 0 276 27"`, "Government of Barbados" wordmark).
   The logo is therefore *already* shared via `@govtech-bb/react` — we reuse
   `Logo`, we do not re-extract it.
3. `@govtech-bb/react` ships `Button`, `Input`, `Search`, `Select`,
   `StatusBanner`, `Heading`, `Text`, `Logo`, `Header`, `cn`, etc. Analytics
   deliberately built its own compact `AnalyticsHeader` rather than use the DS
   `Header` (a taller public-facing GDS header). We follow the analytics look,
   not the DS `Header`.
4. feature_flagging has **no DOM/CSS-class assertions in its tests** (specs cover
   catalogue, search-params, github-oauth, service-status logic only). Restyling
   will not break the suite.
5. New workspace packages are resolved via a `paths` entry in
   `tsconfig.base.json` and consumed as **source** by the Vite apps — so, like
   `packages/analytics`, `@govtech-bb/admin-ui` needs no build target.

## Architecture

### New package: `@govtech-bb/admin-ui`

Source-only workspace package modeled on `packages/analytics`.

```
packages/admin-ui/
  package.json      # name @govtech-bb/admin-ui, private, main/types -> src
  project.json      # nx project, test target only (no build target)
  tsconfig.json     # extends base
  src/
    index.ts        # export { SiteHeader } from './SiteHeader'
    SiteHeader.tsx
```

**`SiteHeader`** — presentational compact blue site bar, generalized from
analytics' `AnalyticsHeader`:

```tsx
export function SiteHeader({
  label,                 // e.g. "Service visibility"
  homeHref = '/',        // logo links home (plain <a>, router-agnostic)
  children,              // right-hand slot (ml-auto): page-specific controls
}: {
  label: string
  homeHref?: string
  children?: React.ReactNode
})
```

- Layout/classes copied from `AnalyticsHeader`: `bg-blue-00 text-white-00`,
  inner `container flex h-16 items-center gap-m`, `Logo` (`h-7 w-auto`) +
  divider (`h-4 w-px bg-blue-40/60`) + label (`text-blue-40 text-caption`).
- No `useRouterState`/date-filter coupling; the right slot is a generic
  `children` region so each app supplies its own controls.
- Depends on `@govtech-bb/react` (for `Logo`) and `react` only.

Rationale for a package with (initially) one consumer: the requester explicitly
asked for extraction to a shared component reusable across both apps. The
package is deliberately minimal (source-only) to keep the plumbing cost low.

### feature_flagging wiring

- **Dependencies** (`apps/feature_flagging/package.json`):
  - add `@govtech-bb/design` and `@govtech-bb/react` at `^1.0.0-alpha.17`
    (same as analytics), `@fontsource/figtree`,
  - add `@govtech-bb/admin-ui` at `workspace:*`,
  - add dev deps `tailwindcss` + `@tailwindcss/vite` (`^4.3.0`).
- **`vite.config.ts`**: add `tailwindcss()` to the `plugins` array (before the
  nitro/tanstack/react plugins, mirroring analytics). Everything else (define,
  nitro, port 3005) unchanged.
- **`app/styles/app.css`**: replace the hand-written rules with the analytics
  preamble — Figtree `@import`s, `@import 'tailwindcss'`, `@import
  '@govtech-bb/design'`, `@source` for `@govtech-bb/react` dist **and** for
  `@govtech-bb/admin-ui` source (so `SiteHeader`'s classes are generated),
  `@plugin '@tailwindcss/typography'` only if used, the `@theme { --font-sans }`
  block, `* { box-sizing }`, `html,body` reset, and the `.container` utility.
- **`tsconfig.base.json`**: add
  `"@govtech-bb/admin-ui": ["packages/admin-ui/src/index.ts"]` to `paths`.

### Per-surface migration (retire `app.css` custom classes)

| Surface (file) | Current classes | After |
| --- | --- | --- |
| **Header** (`routes/index.tsx`) | `.page-head`, `.who`, `.linklike` | `SiteHeader label="Service visibility"` with right slot `{login} · Sign out` (`Button` variant link/ghost or a token-styled button). The in-content title becomes a section-level heading to avoid reading "Service visibility" twice. |
| **Login** (`routes/login.tsx`) | `.auth-screen`, `.auth-card`, `.auth-sub`, `.auth-error`, `.btn-primary` | `SiteHeader label="Service visibility"` (no right slot) + centered card with token utilities; `Button` for sign-in; `StatusBanner` (or token alert) for the `denied`/`csrf` messages. |
| **Services page** (`routes/index.tsx`) | `.page`, `.page-sub`, `.toolbar`, `input/select` | Token/utility page layout; DS `Search` for the query box and DS `Select` for category/type/status filters. |
| **Table + badges + status** (`routes/index.tsx`) | `table`, `th`, `.svc-title`, `.svc-slug`, `.badge(.form/.orphan)`, `select.status`, `.status-*`, `.row-error`, `.empty` | Tailwind utilities with tokens; status colours map to green/yellow/red token families (`enabled`→green, `form_disabled`→yellow, `disabled`→red). |
| **Confirm modal** (`routes/index.tsx`) | `.modal-backdrop`, `.modal`, `.modal-warn`, `.modal-actions`, `.btn-primary/.btn-secondary` | Token utilities; `Button` primary + secondary; `StatusBanner` for the "changes what the public sees" warning. |
| **Audit drawer** (`routes/-audit-drawer.tsx`) | `.drawer-backdrop`, `.drawer`, `.drawer-head`, `.audit-list`, `.audit-item`, `.when/.change/.who-line` | Token utilities; slide-over layout preserved, restyled. `Button` for Close. |

All existing behaviour (OAuth flow, optimistic status change + rollback, FLIP
row animation, debounced search, URL-synced filters, ESC-to-close) is preserved
— this is a styling migration only.

## Verification

1. `pnpm exec nx run feature-flagging-app:test` — green (logic specs unaffected).
2. `pnpm exec nx run-many -t build --exclude=landing` — compiles. Proves the new
   package resolves (tsconfig path), Tailwind wiring is valid, and the DS
   component imports type-check.
3. Drive it: `pnpm --filter @govtech-bb/feature-flagging-app dev` (port 3005),
   then use the `verify`/browser tooling to eyeball login, header, services
   table, filters, confirm modal, and audit drawer against the analytics look.

## PR

- Branch off `main` (no `.` in the name), e.g. `feat-shared-admin-ui-chrome`.
- Open **against `main`**.
- Labels: `enhancement`, `area:frontend`, `subsystem:packages` +
  a feature_flagging area label as appropriate.

## Out of scope

- Migrating analytics to `SiteHeader` (deferred; package makes it a later
  drop-in).
- Any change to feature_flagging behaviour, routing, or server code.
- The DS public `Header`/`Footer`/`OfficialBanner` — analytics doesn't use them
  and neither will this change.
