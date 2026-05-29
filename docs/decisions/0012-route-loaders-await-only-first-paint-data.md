# 0012 — Route loaders await only first-paint data; defer the rest

**Date:** 2026-05-27
**Status:** Accepted
**Related:** [#234](https://github.com/govtech-bb/gov-bb/issues/234)

## Context

A TanStack Router blocking `loader` holds the route's first paint until every
awaited promise resolves. `/builder/ui` awaited two things in parallel — the
registry catalog and `listForms()` — and returned both as loader data.

Only the catalog is needed to render: `StepEditor` and the duplicate-id memo
read it immediately, and it is cheap (60s server cache). `listForms()` is a
slow, uncached `1 + 2N` GitHub Contents-API waterfall whose result is consumed
**only** by the Open picker — a modal that may never open. Awaiting it in the
loader paid that latency on every cold load and held the entire editor behind
data one modal needs. `Promise.all` makes the loader as slow as its slowest
member regardless of how the data is used.

## Decision

A blocking route loader awaits only the data required for the route's **first
paint**. Data consumed lazily (by a modal, a tab, an on-demand panel) is fetched
off the critical path — a mount-time `useEffect`/hook holding the result in
component state (`null` = loading), or a deferred/streamed loader value — not
awaited in the loader.

For `/builder/ui` specifically: the loader returns `{ catalog }` only; the forms
list is prefetched on mount by `useFormsList()` and handed to `FormPicker`,
which renders its own loading/error states.

## Consequences

- **Audit loader awaits against first render.** Before adding an `await` to a
  loader, confirm the value is needed to paint. If only a deferred surface
  consumes it, fetch it there instead. A new `Promise.all` member in a loader is
  a smell worth justifying.
- **Lazy surfaces own their loading/error UI.** Moving a fetch out of the loader
  means the consuming component must handle the not-yet-loaded and failed states
  (here, `forms: …[] | null` plus a `loadError`), since the router no longer
  guarantees the data is present at render.
- **This addresses placement, not cost.** The underlying `listForms` waterfall
  is still slow and uncached; deferring it off the critical path does not fix
  that. Parallelising the per-form fetches and/or adding a server-side cache
  remains a separate follow-up.
