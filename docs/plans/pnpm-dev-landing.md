# `pnpm dev:landing` + pnpm-consistent README

## Goal

Make the landing app reachable through the same root-script pattern as
the other apps (`pnpm dev:forms`, `pnpm dev:api` → `pnpm dev:landing`),
and bring the root `README.md` into line with the toolchain the repo
has actually used since PR #10 (pnpm, not npm).

## Approach

Match the existing `dev:forms` / `dev:api` shape exactly — both are
`nx dev <app>` aliases in the root `package.json`, dispatched by nx
to the app's own `project.json` target. Landing already has a `dev`
target in its `project.json`; the addition is just the root alias.

For the README and `project.json` toolchain references, do a direct
substitution — every `npm install` becomes `pnpm install`, every
`npm run X` becomes `pnpm X`. No structural rewrite, no new sections.

Alternative considered:

- **Make the README change a separate PR from the script addition.**
  Rejected — both are toolchain-consistency work, both are tiny, and
  the README drift is what surfaces every time a contributor follows
  the docs and gets npm-installed `node_modules` that conflict with
  pnpm's hoisted layout. Worth fixing together.

The pre-existing `apps/landing/README.md` (TanStack starter boilerplate
with its own `npm install` references) is **out of scope** — it's
upstream-style docs and warrants a rewrite-as-thin-pointer rather than
a text substitution.

## Scope

- Add `dev:landing` to root `package.json` scripts.
- Update root `README.md`: replace every `npm install` / `npm run X`
  reference with the `pnpm` equivalent. Includes the prereqs block
  ("npm >= 10"), the scripts table, and the migration usage section.
- Update `apps/landing/project.json`: change the `command` field on the
  `build`, `dev`, and `start` targets from `npm run X` to `pnpm X`.
- Update the `migration:create:help` script in root `package.json` so
  the echoed example reads `pnpm migration:create -- <path>` instead of
  `npm run migration:create -- <path>`.

Out of scope:

- `apps/landing/README.md` — TanStack starter boilerplate; separate cleanup.
- Historical docs under `docs/{plans,decisions,summaries,superpowers,testing}/`
  — frozen-in-time records; don't edit.
- `apps/landing/Dockerfile`, `amplify.yml`, `.github/workflows/ci.yml` —
  already on pnpm (PR #10).
- The `package-manager-version-drift` between root (`packageManager: pnpm@10.30.0`)
  and `amplify.yml` / `apps/landing/Dockerfile` (`10.33.4`). Separate
  concern, worth filing as a follow-up.

## Files

Modify:

- `package.json` (root) — add `dev:landing`, fix `migration:create:help` echo.
- `README.md` (root) — npm → pnpm substitution.
- `apps/landing/project.json` — three `command` strings.

## Verify

- `pnpm dev:landing` starts the landing dev server on port 3000.
- `pnpm dev:forms` and `pnpm dev:api` still work (no regression).
- `pnpm migration:create:help` prints the new pnpm-flavoured example.
- README's scripts table and migration section read as a working
  contributor guide on a clean clone — every command in it actually
  runs as written.
- `nx run landing:build`, `nx run landing:dev`, `nx run landing:start`
  continue to dispatch correctly after the `project.json` command swap.

## Open questions

- Whether to bump the root `packageManager` field to match the
  `10.33.4` Dockerfile/amplify version (or vice versa) — flagged as a
  drift but explicitly out of scope here.
