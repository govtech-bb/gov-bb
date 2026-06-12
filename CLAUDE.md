# CLAUDE.md

Guidance for working in this repo. Use **pnpm** for everything — never `npm`.

## Open pull requests against `sandbox` by default

`sandbox` is the default base branch for pull requests — open PRs against it,
not `dev`, unless the human explicitly asks otherwise.

## Never put a `.` in a branch name

Branch names must not contain a period. Each PR gets an Amplify preview at
`<branch>.<appId>.amplifyapp.com`, and Amplify's default-domain cert is a
**single-label wildcard** (`*.<appId>.amplifyapp.com`) — a dotted branch
produces a multi-label subdomain whose HTTPS fails with
`ERR_CERT_COMMON_NAME_INVALID`, breaking both the preview and the forms live
smoke gate. Use `-` instead (e.g. `worktree-term-leave-v1-3-0`, not
`…-v1.3.0`). This is enforced two ways: the `pr-preview.yml` "Guard branch
name" step fails fast in CI, and a local PreToolUse hook
(`.claude/hooks/block-dotted-branch.sh`) blocks branch-creating git commands
with a dotted name.

## Session plans live in `docs/plans/` but are never committed

Session plans (`docs/plans/*.md`) are **not version-controlled**, but the
directory is intentionally **not** gitignored — so plans stay reachable via the
`@`-mention file picker (which respects `.gitignore`). The "don't commit them"
rule is instead enforced by a local PreToolUse hook
(`.claude/hooks/block-commit-plans.sh`): it denies `git commit` when a
`docs/plans/` file is staged (or when an `add -A`/`add . && commit` one-liner
would sweep one in), and denies an explicit `git add docs/plans/...`. A bare
`git add -A` is still allowed — only the commit is blocked. If you need to
commit other work, stage those files **by path** rather than relying on `git
add -A` while a plan is dirty.

### Prefix plan filenames with the issue number

When a session plan relates to a GitHub issue, **prefix the plan filename with
that issue number** — e.g. `docs/plans/1252-drop-processors-for-smoke-submissions.md`,
not `docs/plans/drop-processors-for-smoke-submissions.md`. This keeps the plan
trivially traceable back to its issue in the `@`-mention picker. If no issue
applies, a plain descriptive slug is fine.

## What "clean up" means at the end of a session

When the human says **"clean up"** (or "wrap up and clean up") after work is
committed, run these steps in order:

1. **Push** the current branch to the remote.
2. **Open a PR against `sandbox`** (the default base). If a GitHub issue was
   referenced, include its number in the PR body.
3. **Automatically remove the worktree** once the branch is pushed — no need to
   ask first.
4. **Delete the plan file** (e.g. the `docs/plans/*.md` the session worked
   from) — automatically, no need to ask. A plan exists only to drive the work
   up to the PR; once the PR is open it has served its purpose, and the
   end-of-session summary captures anything worth keeping. Plans are **not**
   version-controlled (see "Session plans live in `docs/plans/`" below), so
   there's nothing to keep around after the PR is made.
5. **Offer to watch CI yourself.** Ask the human whether you should watch the
   PR's CI. If they say yes, run `gh pr checks <n> --watch` and **block until it
   finishes** — do not hand the build back to the human to follow. Then:
   - **All checks green** → merge the PR.
   - **Any check fails** → investigate and fix the failures (push fixes to the
     same branch and re-watch), rather than just reporting them back.

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

Tests run on **Vitest 4** (Jest was removed); the full suite is cheap —
about 30s wall for every project — so run it freely:

```bash
pnpm exec nx run-many -t test               # everything (~30s)
pnpm exec nx run <project>:test             # or just one project
```

apps/api transforms its tests with swc (`unplugin-swc` in its
vitest.config.ts) because Vitest's default esbuild transform can't emit
the `design:paramtypes` metadata NestJS DI resolves constructors from —
keep that plugin in place when touching api test config. The CI build
captures output and fails the job on any error, so a single TypeScript
error in one package fails the whole "Build all packages" step.

**Local caveat:** `landing`'s prebuild fetches from a live external forms API, so
a fully offline `build` fails on that package. `cms` is not in a working state
currently and has been deprioritized — exclude it too. When verifying locally,
run `pnpm exec nx run-many -t build --exclude=landing,cms` and let CI build
everything.

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
