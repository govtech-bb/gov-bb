# Vite frontend env vars use `import.meta.env` only

**Status:** Accepted (2026-05-21)
**Applies to:** `apps/forms`, `apps/landing`, `apps/form_builder`, and any future Vite-built app in this monorepo.

## Context

Vite has a built-in safety convention: only env vars whose name begins with `VITE_` are exposed to client code through `import.meta.env`. Anything else stays server-side. The intent is that a stray `STRIPE_SECRET_KEY` in `.env` cannot accidentally end up in a browser bundle.

`apps/forms` (formerly `apps/web`) was working around that convention. Its `vite.config.ts` called `loadEnv(mode, cwd, "")` with an empty prefix — loading every env var into Node — and then used a `define` block to hand-pick three of them (`VITE_API_URL`, `DESIGN_SYSTEM`, `SKIP_CONTINUE_VALIDATION`) and assign them into the bundle's `process.env`. Callsites then read `process.env.X` at runtime.

Two concrete failure modes followed from this pattern, both surfaced in the sandbox security review (audit finding Web #11, issue #20):

1. `SKIP_CONTINUE_VALIDATION` — a "skip step-validation when truthy" flag — was set to `true` in `.env.example`. Any developer following the documented onboarding step ended up with a bundle that silently bypassed form-step validation. A misconfigured prod env that inherited the example would ship the bypass to citizens.
2. The `define` block is an unguarded allowlist. Nothing prevents a future contributor from adding a non-`VITE_*` var to it — including a secret — and shipping it to every browser that loads the app. The pattern relies entirely on reviewer discipline.

We need a convention that makes both classes of mistake structurally hard rather than relying on vigilance.

## Decision

**Browser-readable config goes through `import.meta.env`.**

Env vars that the browser legitimately needs must be `VITE_`-prefixed. Callsites read them with `import.meta.env.VITE_X`. No `define` block. No `process.env` in browser-bundled code. The Vite prefix convention is the guardrail; adopt it rather than bypass it.

If a callsite needs a server-only value (database URL, third-party secret, etc.), it does not belong in code that gets bundled into the browser. Route it through the API instead.

**Dev-only conveniences use `import.meta.env.DEV`.**

When a flag exists purely to make local development easier — skipping validation, mocking a slow call, opening a debug panel — gate it on `import.meta.env.DEV`. That value is a compile-time boolean Vite resolves statically; the entire branch is tree-shaken from production bundles, so the path is unreachable in prod regardless of how `.env` is configured.

Do **not** introduce a custom env var (`SKIP_X`, `ENABLE_X`, `DEBUG_X`) for this purpose. The runtime check is fragile, the var can be set in prod by mistake, and the bypass code stays in the bundle either way.

## Consequences

- Adding a new browser-readable config means: name it `VITE_*`, add it to `.env.example`, add it to the Amplify console for each environment that needs it, read it with `import.meta.env.VITE_*`. That's the whole flow — no Vite config edit, no `define` block.
- Adding a new dev-only convenience means: gate it with `if (!import.meta.env.DEV) return;` (or `if (import.meta.env.DEV) { ... }`). The flag is automatically prod-safe.
- Server-side code in this monorepo (`apps/api`, build scripts, `apps/form_builder`'s server entries) continues to use `process.env` — this decision applies to **browser-bundled** code only.
- `apps/landing` and `apps/form_builder` are not currently in violation but should follow this convention for any new env-var additions. A retroactive sweep is not in scope of this decision; raise a separate issue if drift is found.
- The test runner must support the pattern. `apps/forms` uses ts-jest in CommonJS mode (per [decision 0002](0002-web-jest-uses-separate-tsconfig.md)), and CommonJS forbids `import.meta` at the language level. To allow tested modules to use `import.meta.env`, `apps/forms/jest.config.ts` wires `ts-jest-mock-import-meta` as an AST transformer with stub values for `DEV`, `PROD`, `MODE`, and the project's `VITE_*` vars. Any future Vite app added to this monorepo that runs unit tests needs the equivalent transformer in its Jest config.
- If a future requirement genuinely needs to expose a non-`VITE_*` var to the browser (none currently anticipated), it requires a new decision that supersedes this one — not a one-off `define` block.
