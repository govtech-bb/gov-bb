# Session summary — App-level branded error fallback (forms) (#1990)

**Date:** 2026-07-17 · **Branch:** `feat-1990-error-fallback` (off `main`)

## What shipped

Closed the app-level error-handling gaps in the forms app (the form route
already had a branded `FormError` boundary; this covers everything around it):

- `createRouter` now sets `defaultErrorComponent: FormError` — any route without
  its own `errorComponent` (index, root layout, …) gets the branded page instead
  of TanStack Router's unstyled default.
- New `ErrorBoundary` class component wraps `<RouterProvider>` (outermost) and
  renders the shared `ErrorPage` (with a Reload action) if anything throws
  *above* the router — the true blank-screen case.
- `window` `error` + `unhandledrejection` listeners log to `console.error` at
  startup, so async / event-handler crashes aren't invisible.

## Why it looks the way it does

- **Reused the existing branded pages, didn't invent.** `FormError` already takes
  `{ error, reset }` — exactly what TanStack Router passes an error component — so
  it drops into `defaultErrorComponent` verbatim. The top-level boundary reuses
  the shared `ErrorPage`. (Per the user: reuse existing branded pages.)

- **`defaultErrorComponent` covers the root too**, so a separate root-route
  `errorComponent` would be redundant — a router default applies to every route
  lacking its own. Left it out.

- **Boundary is outermost** (around `QueryClientProvider` + `RouterProvider`) so a
  throw during provider setup / initial render is also caught, not just router
  errors. React requires a class component for `getDerivedStateFromError`.

- **Kept the rescope honest.** This issue was originally filed as "no error
  handling anywhere / blank screen" — corrected earlier after hands-on repro (the
  form route was already covered). This PR is the narrower, accurate fix.

- **Out of scope:** sending crashes to a backend sink (Sentry/OTLP) needs infra —
  tracked separately. The `ErrorPage` duplication across forms+landing (#1692) is
  deliberately untouched.

## Verification

`error-boundary.spec.tsx` (throwing child → branded fallback; normal child →
renders) passes; full forms suite 774/774; `forms:build` compiles. Verified
`defaultErrorComponent` is a real option in the installed
`@tanstack/react-router` (v1.170.16). Independent of the other in-flight forms
branches (touches `main.tsx` + a new file; #1981 touches `form-renderer.tsx`).
