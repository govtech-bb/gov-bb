# Form builder — defer forms list off the critical load path — Implementation Session

**Date:** 2026-05-27
**Branch:** `feat/form-builder-defer-forms` (to merge into `sandbox`)
**Issue:** [#234](https://github.com/govtech-bb/gov-bb/issues/234) — Form Builder UI: significant lag when opening
**Plan:** `docs/plans/form-builder-ui-defer-forms-load.md`
**Decisions:** [0011](../decisions/0011-form-builder-component-tests-use-per-file-jsdom.md), [0012](../decisions/0012-route-loaders-await-only-first-paint-data.md)

## Context

`/builder/ui`'s blocking loader awaited `Promise.all([getCatalogFn(), listForms()])`. The catalog is cheap (60s server cache) and needed for first paint; `listForms()` is a slow, uncached `1 + 2N` GitHub Contents-API waterfall whose result is consumed only by the Open picker. So the whole editor was held behind data one modal needs. The plan's chosen fix: prefetch-on-mount — drop `listForms()` from the loader, fetch it client-side after first render.

## What we did

**One worktree off `sandbox`, direct implementation** — scope was two files plus tests; a subagent would have added coordination overhead. (Subagents were used for the verbose full-monorepo build/test run and a diff review, to keep the main context lean.)

- Loader returns `{ catalog }` only.
- New `useFormsList()` hook (`-use-forms-list.ts`) fetches `listForms()` once on mount with an unmount guard; returns `{ forms: …[] | null, loadError }`.
- `FormPicker` now takes `forms: …[] | null` + `loadError`, rendering "Loading forms…" / "No forms found." / a fetch error / the rows.
- First React component tests in `form_builder`: `-use-forms-list.spec.tsx` (5) and `-form-picker.spec.tsx` (4). Required new jest wiring — see decision 0011.

## Why we did it that way

- **Extracted a hook instead of inlining the `useEffect` in `BuilderPage`.** The mount-fetch + error + unmount-guard logic is the genuinely bug-prone part, and inlining it would have made it untestable without standing up the whole TanStack router (loader context, `useNavigate`). As a standalone hook it's testable with `renderHook` + a mocked `listForms`. The plan suggested an inline effect; this is a deviation in shape, not behaviour.
- **Per-file jsdom, not a global env flip.** The existing server suites run under `testEnvironment: "node"`; switching the whole project to jsdom to get a DOM would change the environment out from under them. Opted into jsdom per-file via docblock and kept the global node default. (Decision 0011.)
- **Declared `identity-obj-proxy` explicitly.** The CSS-module mapper the component tests need was only present transitively via `@nx/jest`. Relying on a transitive in our own jest config is fragile — a future `@nx/jest` bump could drop it and break CI — so it was added to root devDependencies.
- **`loadError` is a separate prop from FormPicker's existing internal `error`.** The internal `error` is a row-click recipe-load failure; `loadError` is the background list fetch failing. They compose in the same error area via `error || loadError` but are distinct concerns.

Alternatives rejected (per the plan): **fetch-on-open** (leaner, but always spins on first open) and a **TanStack deferred/streaming loader** (more idiomatic, heavier to wire for data one modal consumes).

## Verify

- `form-builder-app`: 9 suites / 125 tests green (fresh, `--skip-nx-cache`).
- Full monorepo `build` (excl. `landing`, network-dep) + `nx run-many -t test`: green; no `TS6059`/`TS6307`; `routeTree.gen.ts` not churned.
- `eslint` clean on all changed files.
- **Manual browser smoke deferred to the user** (standing preference: real-browser over automated drivers) — must run before merging to `sandbox`: cold `/builder/ui` paints without waiting on the forms fetch; Open shows a brief "Loading forms…" on a cold hit then populates; loading a form still works; StepEditor + duplicate-ID panel unaffected.

## Open questions / follow-ups

- **Underlying waterfall unchanged.** `listPublishedForms` is still `1 + 2N` serial GitHub calls with no cache — deferring only moved it off the critical path (decision 0012 names this explicitly). Candidate follow-up: parallelise per-form fetches and/or add a short server-side cache mirroring the catalog's.
- **Picker refetch.** Fetches once on mount and keeps the result in component state; reopening reuses it. A manual refresh affordance can come later if needed.
