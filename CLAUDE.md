# CLAUDE.md

Guidance for working in this repo. Use **pnpm** for everything — never `npm`.

## Open pull requests against `sandbox` by default

`sandbox` is the default base branch for pull requests — open PRs against it,
not `dev`, unless the human explicitly asks otherwise.

## When work is finished, close the related GitHub issue

After completing a piece of work, check GitHub (`gh issue list` / `gh issue
view`) for an issue the work resolves.

- **If the issue was explicitly referenced in the plan**, no confirmation is
  needed — add a comment summarizing the resolution (link the PR/commit) and
  close it.
- **Otherwise**, confirm with the human that it's the right issue before
  closing. Watch for a plan that cites a stale or duplicate issue number — the
  live issue may differ from the one named.

## When creating a GitHub issue, assign it to the author

Whenever you create a GitHub issue (`gh issue create`), always assign it to the
author — pass `--assignee @me` so the new issue is assigned to the account
creating it.

## Apply relevant labels to new issues

Every new issue should carry the labels that describe what it relates to. Run
`gh label list` to see the available set, then apply (via `gh issue create
--label` or `gh issue edit <n> --add-label`):

- **Type** — `bug`, `enhancement`, `security`, etc.
- **Severity** (where it applies) — `severity:critical`, `severity:important`,
  `severity:minor`.
- **Area** — `area:frontend`, `area:backend`, `area:infra`.
- **Subsystem** — e.g. `subsystem:forms`, `subsystem:form-builder`,
  `subsystem:api`, `subsystem:packages`, `subsystem:landing`, `subsystem:ci`,
  `subsystem:docker`. Add more than one when the work genuinely spans them.

Pick labels from the issue's actual content, not just its title.

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
