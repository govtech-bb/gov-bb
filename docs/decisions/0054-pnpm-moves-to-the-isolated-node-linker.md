# 0054 — pnpm moves to the `isolated` node-linker

**Date:** 2026-06-12
**Status:** Accepted — supersedes [ADR 0002](./0002-pnpm-uses-hoisted-node-linker.md)

## Context

ADR 0002 kept pnpm in `hoisted` mode because the migration-time audit looked
expensive: packages leaned on dev-type packages (`@types/jest` et al.) hoisted
from sibling workspaces, and sweeping every `package.json` was out of scope
for a package-manager swap. It asked any successor to document how the audit
cost changed.

It changed completely. The Jest → Vitest migration removed the entire
`@types/jest` hoisting dependency, and the sherif gate had already harmonized
declared versions. Flipping the linker and cold-building everything surfaced
the **real** remaining cost:

- **Four phantom runtime/type deps** in three projects: `tslib` (every
  `importHelpers` consumer), `zod` (form-validation), `dotenv` and
  `json-logic-js` (api). Each now declared where used.
- **Declaration-emit resolution**: compiled `dist/packages/*` `.d.ts` files
  import externals (`zod`) and Node-resolve them **from their own location**,
  walking up to the root `node_modules`. Hoisted satisfied that accidentally.
  Fix: externals referenced by emitted lib declarations (`zod`, `tslib`) are
  declared in root `devDependencies` too, so `dist/**` always resolves them.
- **TS2742 portability errors** in form_builder_api's declaration emit —
  fixed with explicit `Router`/`Express` annotations on exported consts.
- **Docker runtime layout** (the ADR 0003 follow-on): under `isolated`, an
  app's deps live in `apps/<app>/node_modules` and a package's deps in
  `packages/<pkg>/node_modules` — neither is an ancestor of the runtime entry
  `dist/src/main.js`. The api and form_builder_api Dockerfiles now (a) copy
  the app's own `node_modules` and symlink its entries into the root
  `node_modules` (generated loop, not a hand-list — see #412), and (b) graft
  each workspace package's `node_modules` into its compiled dist copy in the
  builder, where the relative `.pnpm` symlinks resolve against the runner's
  root. chat-ingest installs inside the image and runs from `apps/chat`, so
  it is isolated-native and unchanged.

## Decision

**`pnpm-workspace.yaml` no longer sets `nodeLinker` — pnpm's default
`isolated` linker applies.**

## Consequences

- Packages can only import what they declare. A missing declaration fails the
  build loudly instead of silently working until a hoisting change breaks it.
- New dep usage in a package requires declaring it in that package — sherif
  and CI enforce consistency.
- Externals referenced by **emitted lib declarations** must also exist at the
  repo root (currently `zod`, `tslib`). If a lib's public types start
  referencing a new external, add it to root `devDependencies`.
- Verified at migration time: cold `nx run-many -t build` (13 projects),
  repo-wide `tsc -b`, full Vitest suite, sherif, api image boots to config
  validation, form_builder_api image boots and listens.
