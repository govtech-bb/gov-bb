# 0055 — Node10/CJS apps consume shared ESM workspace packages via a narrow subpath

## Context

Several apps (`apps/form_builder_api`, `apps/api`) compile with
`moduleResolution: "node"` (Node10) + `module: "CommonJS"` and run as
`node dist/main.js`. Shared library packages such as `@govtech-bb/ai-bedrock`
are authored as **ESM** (`"type": "module"`, `module: "ESNext"`) and exposed to
bundler consumers (`apps/chat`, Vite) through an `exports` map that points at
**source** (`"." : "./src/index.ts"`).

LIB-03 (#1391) made `form_builder_api` adopt `@govtech-bb/ai-bedrock` instead of
its hand-rolled Bedrock client. That surfaced a wiring problem the existing
bare-specifier packages (`@govtech-bb/database` etc.) never hit, because they
declare `main: "./src/index.js"` and resolve via Node10's main→`.ts` swap, while
a **subpath** import cannot:

- Node10 does **not** read the `exports` field for subpaths, so
  `@govtech-bb/ai-bedrock/converse` is unresolvable through `node_modules` at
  type-check time — it needs a tsconfig `paths` entry.
- `paths` are resolved relative to `baseUrl` (the repo root via
  `tsconfig.base.json`), so the `../../packages/…` style used by the existing
  (effectively dead, node_modules-fallback) entries overshoots; a subpath entry
  must be **repo-root-relative** (`packages/…`).
- Pointing the build `paths` at the package **source** `.ts` pulls it into the
  app's program outside its `rootDir` → `TS6059`. Pointing it at the emitted
  **`.d.ts`** makes it an external declaration (no `rootDir` violation).
- A `.d.ts` is not loadable at runtime, so **dev** (`tsx`, which honours
  `paths`) needs the entry pointed at **source** instead — the two configs
  legitimately diverge.

The barrel was avoidable: `form_builder_api` wants a single non-streaming
Converse call, not the TanStack-AI streaming adapter, so importing the barrel
would drag `@tanstack/ai` into the runtime graph for no reason.

## Decision

A Node10/CJS app consuming a shared **ESM** workspace package imports the
**narrowest subpath export** that satisfies its need, never the barrel when the
barrel pulls transitive deps it won't use. The wiring follows a fixed shape:

1. **Package** adds a subpath to `exports`, e.g.
   `"./converse": { "types": "./src/converse.ts", "default": "./src/converse.js" }`.
   The barrel (`"."`) stays source so bundler consumers (Vite) are untouched.
2. **Consumer build `tsconfig.json`** adds a repo-root-relative `paths` entry
   pointing at the **emitted declaration**:
   `"@govtech-bb/pkg/sub": ["dist/packages/pkg/src/sub.d.ts"]`.
3. **Consumer dev `tsconfig.dev.json`** overrides the same key to **source**:
   `["packages/pkg/src/sub.ts"]` (paths replace wholesale, so re-declare the
   sibling entries too).
4. **Consumer vitest config** adds a specific alias for the subpath **before**
   the `^@govtech-bb/(.*)$` catch-all (which only maps barrels to source).
5. **Dockerfile** mirrors the established per-package pattern: install-stage
   manifest copy, `node_modules/@govtech-bb/<pkg>` symlink, and runner manifest
   copy. The compiled `.js` arrives via the existing `dist/packages/` copy; the
   ESM file is loaded by the CJS runner through Node ≥22 `require(esm)`.

The subpath module keeps its own import graph minimal (for `converse.ts`: only
the alias resolver + the AWS SDK, no `@tanstack/ai`).

## Consequences

- Adding a shared-package subpath to a Node10 app is a five-file checklist, not
  a guess; LIB-04 (`@govtech-bb/aws-secrets`) and LIB-05 (`@govtech-bb/content`)
  follow it when adopted by `form_builder_api` / `api`.
- Build and dev `paths` differ **by design** for any such subpath — this is not
  drift; a comment in `tsconfig.dev.json` records why.
- The runner relies on `require(esm)` (Node 24), so the consumed subpath must
  stay free of top-level `await`.
- Barrel imports remain fine for bundler apps and for bare-specifier packages
  that declare `main`; this ADR governs only the Node10-app × ESM-subpath case.
