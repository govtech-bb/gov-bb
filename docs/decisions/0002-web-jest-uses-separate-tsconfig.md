# 0002 — Web Jest compilation uses a separate tsconfig

**Date:** 2026-05-19  
**Status:** Accepted

## Context

`apps/forms/tsconfig.json` is configured for the Vite build pipeline:

- `"module": "ESNext"` — required by Vite's ESM bundler
- `"jsx": "preserve"` — Vite handles JSX transformation itself
- `"moduleResolution": "bundler"` — uses Vite's resolver semantics

ts-jest runs in Node.js under Jest and requires incompatible settings:

- `"module": "CommonJS"` — Jest's module system
- `"jsx": "react-jsx"` — ts-jest must emit JS, not pass JSX through
- `"moduleResolution": "node"` — standard Node module resolution

When Phase 3 switched `apps/forms` to jsdom and introduced `.tsx` specs, using the shared tsconfig caused JSX parse failures (`SyntaxError: Unexpected token '<'`) and TanStack Router type errors (the router is not globally registered in the Jest context, so strict type inference on `NavigateOptions.search` produced unresolvable `never` types).

## Decision

Maintain a dedicated `apps/forms/tsconfig.jest.json` that ts-jest uses exclusively. It extends `tsconfig.base.json` (not `tsconfig.json`) and overrides only the settings needed for test compilation. The Vite `tsconfig.json` is never referenced by Jest.

ts-jest is configured with:

```ts
{ useESM: false, tsconfig: "<rootDir>/../tsconfig.jest.json", diagnostics: false }
```

`diagnostics: false` disables ts-jest's type-checking pass. Type correctness is the responsibility of the build pipeline (`tsc --noEmit`), not the test runner.

## Consequences

- Changes to `apps/forms/tsconfig.json` (e.g. new path aliases, lib additions) must be mirrored in `tsconfig.jest.json` if the test suite uses them.
- New path aliases added to `tsconfig.base.json` are inherited by both configs and require a matching `moduleNameMapper` entry in `jest.config.ts` for runtime resolution.
- TypeScript errors that appear only under Jest compilation (e.g. router context mismatch) are suppressed by `diagnostics: false`; they remain visible in the IDE and in CI type-check jobs.
