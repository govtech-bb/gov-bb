# CLAUDE.md

Guidance for working in this repo. Use **pnpm** for everything — never `npm`.

## When work is finished, close the related GitHub issue

After completing a piece of work, check GitHub (`gh issue list` / `gh issue
view`) for an issue the work resolves.

- **If the issue was explicitly referenced in the plan**, no confirmation is
  needed — add a comment summarizing the resolution (link the PR/commit) and
  close it.
- **Otherwise**, confirm with the human that it's the right issue before
  closing. Watch for a plan that cites a stale or duplicate issue number — the
  live issue may differ from the one named.

## Delete the plan file once dev-finish writes its summary

A plan in `docs/plans/` is scaffolding for building the change — once the work
is done and `bb:dev-finish` has written the session summary in
`docs/summaries/`, the summary supersedes it (it captures the *why*, and the
*what* now lives in the code). Delete the corresponding plan file in the same
commit as the summary so plans don't pile up.

- Before deleting, check nothing load-bearing links to the plan's path (an ADR
  or another summary may reference it — e.g. ADRs cite plans for deferred
  follow-ups). If something does, update or keep the link rather than orphaning
  it.

## When creating a GitHub issue, assign it to the author

Whenever you create a GitHub issue (`gh issue create`), always assign it to the
author — pass `--assignee @me` so the new issue is assigned to the account
creating it.

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

**Local caveat:** `landing`'s prebuild fetches from a live external forms API, so
a fully offline `build` fails on that package. When verifying locally without
network, exclude it — `pnpm exec nx run-many -t build --exclude=landing` — then
let CI (which has network) build everything.

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
