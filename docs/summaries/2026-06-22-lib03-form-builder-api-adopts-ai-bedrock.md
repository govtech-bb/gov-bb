# LIB-03 — form_builder_api adopts @govtech-bb/ai-bedrock

## Context

`apps/form_builder_api/src/ai/client.ts` hand-rolled its own
`BedrockRuntimeClient` + `ConverseCommand` (one-shot, non-streaming) while a
shared `@govtech-bb/ai-bedrock` package already existed — but only `apps/chat`
used it, and only its streaming `BedrockTextAdapter`. The two paths had already
diverged on the default model id (`global.anthropic.*` in the app vs the
package's `us.anthropic.*` alias). Issue #1391 (one of three independent
extractions in `docs/plans/1391-lib-bedrock-secrets-categories.md`).

## What we did

- Added a dep-free, non-streaming `bedrockConverse()` helper to
  `packages/ai-bedrock/src/converse.ts` (TDD; 6 tests) + a `./converse` subpath
  export.
- Rewrote `client.ts` as a thin shim over it, preserving the `chat()` /
  `isAvailable()` surface so routes and their spec mocks were untouched.
- Wired the dep across `form_builder_api`'s `package.json`, `tsconfig.json`,
  `tsconfig.dev.json`, `vitest.config.ts`, and `Dockerfile`.
- Removed the now-orphaned `@aws-sdk/client-bedrock-runtime` direct dep.
- Captured the resolution convention in ADR
  `0054-node10-apps-consume-esm-workspace-packages-via-subpath`.

## Why we did it that way

**Kept the `global.anthropic.*` default (user decision).** The divergence was
real but deliberate: `form_builder_api/.env.example` sets the `global.*`
inference profile because `ca-central-1` has no ON_DEMAND haiku-4-5. So the shim
keeps the literal default and routes it through `resolveBedrockModelId`
(a no-op pass-through for raw ids), with `AI_MODEL` still overriding. We did
*not* standardise on `us.*` — that would have silently changed the deployed
profile.

**A new non-streaming helper, not the streaming adapter.** The app wants one
Converse call. Importing the barrel would drag `@tanstack/ai` into a CJS
server's runtime graph for nothing, so `converse.ts` imports only the alias
resolver + the AWS SDK, exposed via a narrow `./converse` subpath.

**The packaging was the real work, not the helper.** `form_builder_api` is a
Node10/CJS app run as `node dist/main.js`, resolving workspace deps via Dockerfile
symlinks + `package.json`, whereas `ai-bedrock` is ESM exporting raw `.ts` source
(fine for Vite-bundled `chat`, not for a compiled node app). Getting a *subpath*
to resolve under Node10 took several dead ends (see ADR 0054 and below). Verified
the CJS-requires-ESM interop by replicating the runner layout and `require()`-ing
the built artifact under Node 24 — not just trusting it.

## What we almost got wrong

- First `paths` entry used the sibling `../../packages/…` style. A
  `--traceResolution` showed those entries are **dead** (resolved relative to
  `baseUrl` = repo root, so they overshoot); the existing packages only work via
  a `node_modules` main→`.ts` fallback that a subpath can't use. Fixed to
  repo-root-relative.
- Pointing the build `paths` at source `.ts` then tripped `TS6059` (file outside
  `rootDir`). The build entry must point at the emitted `.d.ts`; only **dev**
  (`tsx`) points at source. A first dev check returned `bedrockConverse:
  undefined` because `tsx` honoured the build path and loaded the `.d.ts` — hence
  the `tsconfig.dev.json` override.
- An early failed build emitted stray CJS `.js`/`.d.ts` into
  `packages/ai-bedrock/src/`, which then broke vitest (ESM package loading a CJS
  `models.js`). Deleted them.
- `form_builder_api`'s vitest `@govtech-bb/(.*)` catch-all alias mangled the
  subpath → added a specific alias ahead of it.

## Open questions

None for LIB-03. The sibling extractions LIB-04 (#1392, aws-secrets) and LIB-05
(#1393, content) remain unstarted — separate PRs; ADR 0054 gives them the wiring
recipe if a Node10 app consumes them.
