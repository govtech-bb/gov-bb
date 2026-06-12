# 0002 — pnpm uses the `hoisted` node-linker

**Date:** 2026-05-20
**Status:** Superseded by [ADR 0054](./0054-pnpm-moves-to-the-isolated-node-linker.md)

## Context

The repo migrated from npm workspaces to pnpm@10.33.4 to bring it onto the package manager devs prefer and to unblock the upcoming containerisation work.

pnpm's default linker is `isolated` — each workspace gets its own `node_modules/` of symlinks into a content-addressable store, and packages can only resolve dependencies they explicitly declare. This is stricter than what npm workspaces (or yarn classic) do, which is a flat, hoisted `node_modules/` at the repo root.

During the migration, several `packages/*/tsconfig.json` files were found to declare `"types": ["jest"]` (and similar) without listing the corresponding `@types/*` package as a dependency. npm workspaces had been hoisting those types from a sibling workspace (`apps/api`) to the root, where TypeScript's Node module resolution picked them up transparently. Under pnpm's `isolated` default, those resolutions fail and `nx build` errors with `Cannot find name 'expect'`, `TS7006: Parameter 'b' implicitly has an 'any' type`, etc.

The fix in principle is to declare every dev-type dependency explicitly in the package that uses it. That sweep touches every `packages/*` and `apps/*` `package.json` and requires coordination across teams to make sure no resolution silently changes.

That was out of scope for a package-manager swap.

## Decision

**`pnpm-workspace.yaml` sets `nodeLinker: hoisted`.**

(Originally this lived in `.npmrc` as `node-linker=hoisted`, but npm reads
`.npmrc` too and warned `Unknown project config "node-linker"` on every npm/npx
invocation — and npm's next major will hard-fail on it. pnpm ≥9.15 reads
settings from `pnpm-workspace.yaml`, which npm never touches, so the setting
moved there and `.npmrc` was deleted.)

pnpm runs in hoisted mode, producing a flat root `node_modules/` similar to npm's behaviour. Existing tsconfigs and code keep working without per-package dependency cleanup.

## Consequences

- Adding a new package does **not** require declaring transitive dev-types — they will continue to be hoisted from siblings, the same way npm worked.
- The repo loses pnpm's strictness benefit (a package can accidentally import something it doesn't declare). This is the same situation we had with npm; this ADR documents that we chose to keep it rather than that it was overlooked.
- Moving to `node-linker=isolated` is a separate, follow-up effort. It requires:
  - Auditing every package's `tsconfig.json` for `types: [...]` entries and ensuring the package declares each one.
  - Auditing every package's source for imports of packages not declared in its `package.json` (including transitive runtime usage).
  - Migrating in one PR to avoid a "half-strict" intermediate state.
- Any future ADR that supersedes this one should document what changed about the audit cost — e.g. tooling support, fewer packages, a strict-mode pilot that surfaced the real ergonomic cost.
