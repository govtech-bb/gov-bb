# CLAUDE.md

Guidance for working in this repo. Use **pnpm** for everything — never `npm`.

## Behavioral Guidelines

These are the guidelines that you should adhere to as you work in this codebase.

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

2. Simplicity First

- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.
- When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Key Considerations

### Open pull requests against `sandbox` by default

`sandbox` is the default base branch for pull requests — open PRs against it,
not `dev`, unless the human explicitly asks otherwise.

### Never put a `.` in a branch name

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

### Session plans live in `docs/plans/` but are never committed

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

### What "clean up" means at the end of a session

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

### When work is finished, close the related GitHub issue

After completing a piece of work, check GitHub (`gh issue list` / `gh issue
view`) for an issue the work resolves.

- **If the issue was explicitly referenced in the plan**, no confirmation is
  needed — add a comment summarizing the resolution (link the PR/commit) and
  close it.
- **Otherwise**, confirm with the human that it's the right issue before
  closing. Watch for a plan that cites a stale or duplicate issue number — the
  live issue may differ from the one named.

### When creating a GitHub issue, assign it to the author

Whenever you create a GitHub issue (`gh issue create`), always assign it to the
author — pass `--assignee @me` so the new issue is assigned to the account
creating it.

### Apply relevant labels to new issues

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

### Run the build, and the tests for what you touched, before committing or pushing

CI runs the full build and the full test suite. Run the build the same way
locally first — don't rely on CI to catch breakage:

```bash
pnpm exec nx run-many -t build   # all packages must compile
```

For tests, **only run the suites for the apps or packages you actually
touched** — don't run the full `nx run-many -t test`. Target the affected
projects instead:

```bash
pnpm exec nx run <project>:test             # one project you changed
pnpm exec nx run-many -t test -p p1,p2      # the specific projects you changed
```

The reason is **out-of-memory issues**: running the full test suite locally
spawns too many parallel test processes and crashes the machine. Every Jest
config now caps its own workers and recycles memory (see below), which removes
the single-suite crash risk — but scoping still keeps the full run's total
parallelism, and its wall-clock time, in check. CI still runs the full test
suite, so anything you didn't touch is covered there. This keeps the local loop
fast while a green build before push avoids the round-trip of a failed CI run.
The CI build captures output and fails the job on any error, so a single
TypeScript error in one package fails the whole "Build all packages" step.

**Local caveat:** `landing`'s prebuild fetches from a live external forms API, so
a fully offline `build` fails on that package. `cms` is not in a working state
currently and has been deprioritized — exclude it too. When verifying locally,
run `pnpm exec nx run-many -t build --exclude=landing,cms` and let CI build
everything.

### Monorepo build gotcha: new packages must be buildable AND referenced

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
