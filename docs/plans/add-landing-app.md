# Add `landing` app (TanStack Start) to the monorepo

## Goal

Bring `govtech-bb/alphagovbb/apps/web` into this repo as a new app `apps/landing`. It's the public-facing landing site, built on TanStack Start + Vite + React 19. It lives alongside the existing Next.js `apps/web` (forms) and NestJS `apps/api`.

## Approach

Clean snapshot copy, no git history. Pin landing to its own toolchain versions (React 19, TS 6, ESLint 9, Vite 8, Vitest 4) — these diverge from the rest of the repo (React 18 / TS 5.7 / ESLint 8) by design, tracked via npm workspaces nesting. Wire landing into Nx via `nx:run-commands` so existing scripts (`nx run-many -t build`, etc.) pick it up without needing `@nx/vite` or a TanStack-specific plugin. Document the divergence in the root README.

Alternatives considered and rejected:
- **Convert to Next.js** — loses upstream parity with `alphagovbb`; rewriting routes, loaders, and server functions is unnecessary work.
- **Subtree merge to preserve history** — explicitly declined; single squash import is simpler.
- **Bump whole monorepo to React 19 / TS 6** — would force regression testing of `web` and `api` for no current benefit.

## Scope

- Snapshot-copy `alphagovbb/apps/web/*` into `apps/landing/` (no `.git`, no `pnpm-lock.yaml`).
- Rewrite `apps/landing/package.json`:
  - `name`: `@govtech-bb/landing`
  - Keep all upstream deps with their pinned versions
  - Remove `@aws-sdk/client-sesv2` (SES deferred)
  - Keep scripts as-is; dev port stays `3000`
- Strip AWS SES code paths (likely a contact-form route + server function — identify on import via grep for `client-sesv2` / `SendEmail`). Remove cleanly rather than stubbing; re-add via git later when SES is wired.
- Add `apps/landing/project.json` with `nx:run-commands` targets: `dev`, `build`, `start`, `lint`, `test`, `typecheck`.
- Convert any pnpm-isms in configs (none expected — `@govtech-bb/design` and `@govtech-bb/react` are published, not workspace refs — but verify on import).
- Carry over landing's own configs: `eslint.config.js` (flat), `prettier.config.js`, `tsconfig.json`, `vite.config.ts`, `.cta.json`, `.gitignore`, `.prettierignore`. These are scoped to the app and won't clash with repo-root configs.
- Root-level changes:
  - `package.json`: add `dev:landing` and `start:landing` scripts mirroring the `web`/`api` pattern.
  - `README.md`:
    - Add `apps/landing` row in the project structure (port 3000).
    - Add `dev:landing` / `start:landing` rows in the scripts table.
    - Add a **Toolchain divergence** section explaining that `landing` pins React 19 / TS 6 / ESLint 9 / Vite 8 / Vitest 4 because it tracks the upstream `alphagovbb` repo on TanStack Start; the rest of the monorepo stays on React 18 / TS 5.7 / ESLint 8.
- Leave alone: `nx.json`, `tsconfig.base.json`, `amplify.yml`. No Amplify wiring (deferred).
- Commit as a single squash-style commit: `feat: add landing app (TanStack Start) from alphagovbb`.

## Files

Add:
- `apps/landing/**` (whole tree from upstream snapshot)
- `apps/landing/project.json` (new — Nx target wiring)
- `docs/plans/add-landing-app.md` (this file)

Modify:
- `package.json` (root scripts)
- `README.md` (structure, scripts, divergence section)

## Verify

- `npm install` at repo root completes; npm workspaces nests React 19 / TS 6 inside `apps/landing/node_modules` without touching `web`/`api` resolutions.
- `npm run dev:landing` (or `nx dev landing`) starts on `http://localhost:3000` and serves the landing UI.
- `nx build landing` produces `apps/landing/dist` (client + server bundles).
- `nx run-many -t lint` passes — landing uses its own ESLint 9 flat config, `web`/`api` keep theirs.
- `nx run-many -t build` builds all three apps.
- `apps/web` and `apps/api` still build, lint, and run unchanged (no version regressions from hoisting).
- `apps/landing/dist/server/server.js` starts via `npm run start:landing` (sanity check the SSR server even though deployment is deferred).

## Open questions

- **TypeScript 6 install.** Source pins `"typescript": "^6.0.2"`. Confirm it resolves cleanly under the current npm registry — if it doesn't, fall back to whatever version `alphagovbb` actually has working in its lockfile (visible in `pnpm-lock.yaml`).
- **Exact SES code surface.** Need to grep on import — likely one contact-form route + a server function. Whether to remove the route entirely or leave a no-op page is a small judgment call to make then.
- **Tailwind v4 build under Nx caching.** The TS 6 + Tailwind v4 + Vite 8 combo is new; if Nx's build cache misbehaves, fall back to `cache: false` for landing's `build` target.
