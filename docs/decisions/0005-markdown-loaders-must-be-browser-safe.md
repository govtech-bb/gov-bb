# 0005 — Markdown loaders in client-bundled modules must be browser-safe

**Date:** 2026-05-21
**Status:** Accepted

## Context

`apps/landing` is a TanStack Start app — same code evaluates on the server
(SSR) and in the browser (hydration + SPA). Two modules under
`apps/landing/src/content/` (`registry.ts`, `mda.ts`) loaded every `.md`
file via `import.meta.glob('?raw')` and parsed it with `gray-matter` at
module-init:

```ts
const loaded = loadAll() // top-level call, runs on import
```

`gray-matter` is a Node library — it calls `Buffer.from(...)` internally.
In the browser bundle there is no `Buffer` global, so the call threw
`ReferenceError: Buffer is not defined` at module evaluation time, *before
the module's exports became available*. Every downstream consumer (the
route tree, layout components, form routes) failed to evaluate behind it.

The damage was invisible because:

- SSR runs in Node, so server-side rendering succeeded and the page
  reached the browser fully rendered.
- The hydration script then errored out silently — React event handlers
  were never attached.
- Routes whose only interactivity was TanStack `<Link>` (declarative
  anchors) appeared to work because clicking an `<a href>` triggers
  normal browser navigation, no JS required.
- Anything *actually* interactive — `useState`, `onSubmit`, `onClick` —
  was inert. The first form to land (`/business-trade/crop-over-permits/form`)
  rendered correctly, then native-submitted on Continue because
  `e.preventDefault()` never ran.

The pre-existing summary in `2026-05-21-bank-holiday-calendar.md` flagged
the `Buffer is not defined` log as "pre-existing, unrelated, and the page
renders despite it." That diagnosis was wrong — the page rendered because
SSR did it; hydration was dead, just invisible.

## Decision

Any module that is reachable from the client bundle and parses markdown
or YAML must use a parser that evaluates cleanly in the browser. That
means **no `gray-matter`**, no `remark`/`unified` plugins that pull in
Node-only deps, no direct `Buffer` or `process` usage in shared modules.

For frontmatter parsing in `apps/landing`, use the shim at
`apps/landing/src/lib/parse-frontmatter.ts` — it wraps `js-yaml` (which
*is* browser-safe) and returns the same `{ data, content }` shape that
the previous `gray-matter` call sites consumed.

If a future feature truly needs server-only parsing (e.g. a build-time
content pipeline), gate it behind TanStack Start's server-only entry
points so it never reaches the client graph — don't reintroduce
`gray-matter` into a shared module.

## Consequences

- New content loaders should import from `lib/parse-frontmatter.ts`, not
  install fresh parsers. If `parseFrontmatter` lacks something a future
  loader needs (e.g. comments, custom YAML tags), extend it there rather
  than reintroducing `gray-matter`.
- **CI gap to close.** SSR can hide hydration failures of exactly this
  shape — the visible page looks fine, the unit tests pass (they run in
  jsdom which has `Buffer` polyfilled), and only manual browser
  interaction surfaces the problem. A smoke test that mounts a route in
  a real headless browser and exercises one interactive element would
  catch this class of bug. Not in scope today; worth filing as a
  follow-up.
- Other apps (`forms`, `web`, `chat`) are not currently affected — they
  don't load markdown at module-init — but the same rule applies if
  they grow content-loading code.
- The constraint is removable in principle (e.g. by polyfilling `Buffer`
  globally via a Vite plugin), but doing so masks the underlying problem
  rather than fixing it: code that *expects* a Node runtime would still
  silently misbehave in other ways under a polyfill. Prefer
  browser-native libraries over polyfilling.
