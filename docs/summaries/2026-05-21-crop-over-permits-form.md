# Crop Over permits form — landing migration

Ported the 5-step Crop Over permits wizard from frontend-alpha to
`apps/landing`. The form asks about event type, venue, expected size,
and feature flags (alcohol, music, pyrotechnics, etc.) and returns an
ordered checklist of permits with urgency tags, expandable docs, and a
print-to-PDF button.

Mounted at `/business-trade/crop-over-permits/form` via TanStack file
routing (`business-trade.crop-over-permits.form.tsx`).

## Shape

Mirrored the orphaned `blocks/pension/` and `blocks/severance/` pattern
that earlier work had set up but never wired to routes:

- `apps/landing/src/blocks/crop-over-permits/permits.ts` — types +
  `PERMITS` dataset + label maps.
- `apps/landing/src/blocks/crop-over-permits/compute.ts` —
  `getActivePermits` (filters by venue + feature flags) and
  `renumberSteps` (collapses shared `step` values into sequential
  display numbers).
- `apps/landing/src/blocks/crop-over-permits/compute.test.ts` — 8
  vitest cases including the multi-condition AND rule, the null-venue
  case, step collapsing, and the always-on permits.
- `apps/landing/src/blocks/crop-over-permits/CropOverPermitsForm.tsx` —
  the wizard UI ported verbatim except for stack adaptations.
- `apps/landing/src/routes/business-trade.crop-over-permits.form.tsx` —
  thin route file.

## Stack adaptations

- Dropped `"use client"`.
- `useRouter().push(SERVICE_PATH)` → `useNavigate({ to: '/$', params: { _splat: 'business-trade/crop-over-permits' } })` — the service root resolves through landing's catch-all `/$` route, so the splat-params form is the only typed way to navigate to it.
- Dropped the source's `<Breadcrumbs />` on the result step. Landing's
  `Breadcrumbs` returns `null` on any `/form` route by design.

## The hydration bug

The form rendered correctly on first load (SSR) but clicking Continue
caused the URL to change to `?event=fete` — a *native* GET form
submission. `preventDefault()` had never fired, which meant React's
`onSubmit` handler was never attached.

Root cause was `gray-matter` in `apps/landing/src/content/{mda,registry}.ts`.
Both modules called `loadAll()` at module-init, which called `matter()`,
which called Node's `Buffer.from(...)`. In the browser bundle `Buffer`
is undefined, so the call threw `ReferenceError` *before the module
finished evaluating* — and every downstream consumer (including the
route tree) failed to load with it. React's hydration script never ran.

The bank-holiday-calendar summary had observed the `Buffer is not
defined` log earlier and concluded "pre-existing, unrelated, and the
page renders despite it." That conclusion was wrong: the page rendered
because SSR did the work; hydration was dead, just invisible. The
bank-holiday-calendar got away with it because its only interactive
elements were TanStack `<Link>` components, which render as plain `<a
href>` and work without JS — clicking them triggered normal full-page
navigation that *looked* like SPA routing.

The crop-over-permits form was the first thing to ship that needed
`onSubmit`, `useState`, and event handlers to actually fire. So it was
the first thing to surface the hydration failure.

Fix: replaced `gray-matter` with a 15-line `parseFrontmatter()` helper
in `apps/landing/src/lib/parse-frontmatter.ts`. It splits the source on
the leading `---` fences and parses the YAML block with `js-yaml`, which
is browser-safe (no `Buffer`, no `process`). Both `mda.ts` and
`registry.ts` swapped to the new helper. `gray-matter` dropped from
`apps/landing/package.json`.

Recorded as
[ADR 0005](../decisions/0005-markdown-loaders-must-be-browser-safe.md):
markdown loaders in client-bundled modules must be browser-safe.

## What this exposed

The fix is in, but the **CI gap** that hid this bug for weeks remains:

- jsdom has `Buffer` polyfilled by default, so vitest passed.
- SSR runs in Node, so the page rendered.
- Lint/typecheck don't run the code.
- No headless-browser smoke test exists to exercise an interactive
  element on a built page.

A "click one button, expect the URL not to change" smoke test would
have caught this immediately. Worth filing as follow-up work.

## Files

- `apps/landing/src/blocks/crop-over-permits/{permits,compute,CropOverPermitsForm,compute.test}.ts(x)` (new)
- `apps/landing/src/routes/business-trade.crop-over-permits.form.tsx` (new)
- `apps/landing/src/lib/parse-frontmatter.ts` (new)
- `apps/landing/src/content/{mda,registry}.ts` (updated)
- `apps/landing/package.json` (drop `gray-matter`, add `js-yaml` + types)
- `apps/landing/src/routeTree.gen.ts` (regenerated)
- `docs/plans/crop-over-permits-form.md`
- `docs/decisions/0005-markdown-loaders-must-be-browser-safe.md`

PR: https://github.com/govtech-bb/gov-bb/pull/70 → `dev`.
