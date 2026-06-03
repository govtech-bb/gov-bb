# 0003 — Containerised api needs explicit workspace symlinks at root `node_modules`

**Date:** 2026-05-21
**Status:** Superseded by [ADR 0032](./0032-pnpm-uses-isolated-node-linker.md) — `pnpm deploy` replaces the symlink assembly

## Context

The api Dockerfile multi-stage build copies pnpm-installed `node_modules` from the builder to the runner. Bringing up the api container failed three times in succession (during the original work that produced PR #23) with `MODULE_NOT_FOUND` for in-repo workspace packages:

```
Error: Cannot find module '@govtech-bb/form-types'
require stack:
  /app/dist/src/expressions/expressions.service.js
  …
  /app/dist/src/main.js
```

Why this happens:

- pnpm runs in `hoisted` linker mode ([ADR 0002](./0002-pnpm-uses-hoisted-node-linker.md)) — external deps land in root `node_modules`, but **workspace** packages are linked into the consumer's own `node_modules`, i.e. `apps/api/node_modules/@govtech-bb/*`.
- The runtime stage of `apps/api/Dockerfile` copies `dist/apps/api/*` and renames it to `dist/*`. The entry point becomes `/app/dist/src/main.js`.
- Node's module-lookup algorithm walks up the filesystem from the requiring module, checking each ancestor's `node_modules`. From `/app/dist/src/main.js` it checks `/app/dist/src/node_modules`, `/app/dist/node_modules`, `/app/node_modules`, `/node_modules`. **It never enters `/app/apps/api/node_modules`** — that path isn't an ancestor of the requiring file.

The previous Dockerfile (under npm workspaces, before [ADR 0002](./0002-pnpm-uses-hoisted-node-linker.md)) happened to work because npm hoisted workspace packages to root `node_modules/` as real directories. Under pnpm `hoisted`, workspace packages stay isolated per consumer.

## Decision

**The api Dockerfile's runner stage must explicitly symlink every `@govtech-bb/*` workspace dependency into `/app/node_modules/@govtech-bb/`**, where the runtime's module-lookup will find them.

In the runner stage:

```dockerfile
RUN mkdir -p node_modules/@govtech-bb && \
    ln -sfn ../../packages/expressions      node_modules/@govtech-bb/expressions && \
    ln -sfn ../../packages/form-conditions  node_modules/@govtech-bb/form-conditions && \
    ln -sfn ../../packages/form-types       node_modules/@govtech-bb/form-types && \
    ln -sfn ../../packages/form-validation  node_modules/@govtech-bb/form-validation
```

The symlink targets are relative; `/app/node_modules/@govtech-bb/form-types → ../../packages/form-types` resolves to `/app/packages/form-types`, which the runner stage already populates from `dist/packages/`.

## Consequences

- **Maintenance constraint:** when the api gains a new workspace dependency (a new package added to `apps/api/package.json` like `@govtech-bb/something`), the `ln -sfn` block in `apps/api/Dockerfile` must be updated to include it. Forgetting this surfaces only at runtime — a fresh image starts and fails with `MODULE_NOT_FOUND`. No build-time check catches it.
- A pre-merge CI step that boots the image and probes `/health` would catch this automatically. Not in scope today; would be the way to lift this constraint without lifting the underlying linker decision.
- Landing and forms don't need this — both ship the source tree intact in the runner stage and Vite resolves via `tsconfig.base.json` `paths`, not Node's standard module-lookup.
- The constraint is removable by switching to `node-linker=isolated` and declaring dev-types per-package (the path back from [ADR 0002](./0002-pnpm-uses-hoisted-node-linker.md)). Until that happens, this ADR holds.
