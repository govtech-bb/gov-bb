# Forms error page matches landing ErrorPage; banner aligned

**Issue:** [#1692](https://github.com/govtech-bb/gov-bb/issues/1692) —
area:frontend, bug, subsystem:forms.

## What changed

The forms error states ("Form not found", connection error, generic error) and
the page-not-found page now render with the landing app's `ErrorPage` layout
(container padding, width constraint, title, intro, "Suggestions:" list,
secondary + primary actions). The official-government banner content now aligns
to the page container instead of hugging the viewport edge.

## Why it looks the way it does

**Mirrored, not shared — because the shared package is external.** The issue's
preferred approach was to promote `ErrorPage` into `@govtech-bb/react`. That
package is **external/published** (`@govtech-bb/react@^1.0.0-alpha.16`, in
`node_modules`, not a workspace package here), so it can't be edited in this
repo. Per the issue's fallback, `ErrorPage` was mirrored as a forms-local
component (`apps/forms/src/components/error-page.tsx`). Feasible because forms
already has Tailwind (`@tailwindcss/vite`) and a `.container` rule in
`govtech.css`, and already depends on `@govtech-bb/react`. **Follow-up:** promote
`ErrorPage` into `@govtech-bb/react` so landing and forms share one component;
that work lives in that package's own repo.

**`ErrorPage` gained an `onClick` action.** Landing's version only supports href
links. Forms' connection/generic error states have a "Try again" that re-runs
the route loader (`reset()`) — a plain link can't do that. So the forms
`ErrorPage` action is `{label, href}` OR `{label, onClick}`: the 404 uses links
(homepage + service directory), the transient errors keep the retry button. A
404 deliberately offers no "Try again" (it isn't transient).

**Raw `error.message` is no longer shown.** The old `FormError` printed
`error.message` to the citizen. The new copy uses friendly, state-specific intro
text instead — an internal error string isn't useful or appropriate on a public
page. The test asserting the raw message was removed accordingly.

**Banner alignment copies landing's exact pattern.** `OfficialBanner` is the
same external component; its inner row has a fixed `px-4`. Landing's `Header.tsx`
aligns it by wrapping in `bg-blue-100 > .container` and passing
`className="[&>div]:px-0"` to zero that inner padding. Forms' `__root.tsx` now
does the same, so the banner gutter matches the rest of the layout.

## Tests / verification

`form-error.spec.tsx` rewritten for the new structure (headings, suggestions,
link vs retry actions per state); `not-found.spec.tsx` updated for the
"Return to homepage" link label. Full forms suite 760/760; `forms:build` clean.

**Not done:** a pixel-level visual spot-check in the running app (404 slug +
banner alignment). Structure/behaviour are test-covered and the banner fix
mirrors landing's known-good pattern, but eyes-on via `/verify` or the dev server
is still recommended before merge.
