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

## Run the build, and the tests for what you touched, before committing or pushing

CI runs the full build and the full test suite. Run the build the same way
locally first — don't rely on CI to catch breakage:

```bash
pnpm exec nx run-many -t build   # all packages must compile
```

For tests, **only run the suites for the apps or packages you actually
touched** — don't run the full `nx run-many -t test`. Target the affected
projects instead:

```bash
pnpm exec nx run -t test <project>          # one project you changed
pnpm exec nx run-many -t test -p p1,p2      # the specific projects you changed
```

The reason is **out-of-memory issues**: running the full test suite locally
spawns too many parallel test processes and crashes the machine. Scoping tests
to what you touched keeps memory in check. CI still runs the full test suite, so
anything you didn't touch is covered there. This keeps the local loop fast while
a green build before push avoids the round-trip of a failed CI run. The CI build captures output and fails the job on
any error, so a single TypeScript error in one package fails the whole "Build
all packages" step.

**Local caveat:** `landing`'s prebuild fetches from a live external forms API, so
a fully offline `build` fails on that package. When verifying locally without
network, exclude it — `pnpm exec nx run-many -t build --exclude=landing` — then
let CI (which has network) build everything.

### The `api` suite needs a worker cap, or it crashes the host

Do **not** run the `api` tests via `pnpm exec nx run-many -t test -p api` (or
plain `npm test` in `apps/api`) on a high-core machine. With no `maxWorkers`
set, Jest forks `numCpus − 1` workers (≈31 on a 32-core box), and each worker
runs `ts-jest` (in-memory TypeScript compiler) **plus** coverage instrumentation
(`collectCoverage: true`) and grows unbounded. ~31 heavyweight workers blow past
available RAM and crash the machine.

Run the `api` suite directly with a worker cap and a per-worker memory limit:

```bash
cd apps/api && pnpm exec jest --config jest.config.ts \
  --maxWorkers=2 --workerIdleMemoryLimit=512MB --silent
```

`--maxWorkers=2` caps concurrent workers; `--workerIdleMemoryLimit=512MB`
recycles any worker that grows past 512 MB; `--silent` suppresses the suite's
noisy Nest logger output so failures are readable. Verified: the full 64-spec suite
passes with coverage in ~27 s, peaking at ~3 GB above baseline (vs. crashing the
host unbounded). This affects only the `api` suite — other projects' tests are
not memory-problematic and run fine via the normal `nx run`/`nx run-many`
commands above. CI runs `api` on low-core boxes where the default worker count
is already small, so it is unaffected.

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
