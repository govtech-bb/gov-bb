# CLAUDE.md

Guidance for working in this repo. Use **pnpm** for everything — never `npm`.

## Always run the full build and tests before committing or pushing

CI runs these two commands. Run the same ones locally first — don't rely on CI to
catch breakage:

```bash
pnpm exec nx run-many -t build   # all packages must compile
pnpm exec nx run-many -t test    # all test suites must pass
```

A green local build/test before push avoids the round-trip of a failed CI run.
The CI build captures output and fails the job on any error, so a single
TypeScript error in one package fails the whole "Build all packages" step.

## Monorepo build gotcha: new packages must be buildable AND referenced

This is an nx + TypeScript project-references monorepo. Packages build with the
strict `@nx/js:tsc` executor (`composite: true` + `rootDir`). When package A
imports package B (`@govtech-bb/B`), **two things are required** or the build
fails with `TS6059` / `TS6307` ("not under rootDir" / "not listed within the
file list"):

1. **B must be a buildable nx project** — it needs a `project.json` with an
   `@nx/js:tsc` `build` target so its declaration output is produced and built
   before A. (See `packages/form-types/project.json` and
   `packages/registry/project.json` for the pattern.)
2. **A's `tsconfig.json` must list B in `references`** — e.g.
   `"references": [{ "path": "../B" }]` — so tsc uses B's declarations instead
   of pulling B's `.ts` source into A's program.

A package that is only consumed by a Vite/bundler app (which bundles source
directly) can get away without a build target — but the moment a strict `tsc`
library imports it, both requirements above apply. This is what broke the build
when `@govtech-bb/form-builder` started importing `@govtech-bb/registry`.
