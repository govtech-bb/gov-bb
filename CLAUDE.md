# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository. `AGENTS.md` points here;
`CONTRIBUTING.md` is the human contract both files defer to.

## Repository Overview

Simple Service Builder (SSB) is the Government of Barbados services platform behind alpha.gov.bb:
citizen-facing service pages and forms, the no-code Form Builder that authors them, and the
backends that serve and process submissions. The repository is a **pnpm monorepo** managed with
**Nx** and TypeScript project references. Use **pnpm** for everything — never `npm` or `yarn`.

| Directory               | Nx project             | Stack                                           | Deploy                         | Tests              |
| ----------------------- | ---------------------- | ----------------------------------------------- | ------------------------------ | ------------------ |
| `apps/api`              | `api`                  | NestJS 11, TypeORM, Postgres                    | ECS/Fargate                    | Vitest (swc)       |
| `apps/form_builder_api` | `form-builder-api`     | Express, TypeORM, Bedrock                       | ECS/Fargate                    | Vitest             |
| `apps/forms`            | `forms`                | Vite + React SPA                                | Amplify (static)               | Vitest, Playwright |
| `apps/landing`          | `landing`              | TanStack Start + Nitro SSR, markdown content    | Amplify (compute)              | Vitest             |
| `apps/form_builder`     | `form-builder-app`     | TanStack Start, Lexical, TanStack AI            | Amplify (compute)              | Vitest             |
| `apps/analytics`        | `analytics-app`        | TanStack Start, Umami reporting                 | Amplify (compute)              | Vitest             |
| `apps/feature_flagging` | `feature-flagging-app` | TanStack Start, GitHub-OAuth admin              | Amplify (compute)              | Vitest             |
| `apps/chat`             | `chat`                 | TanStack Start + TanStack AI, Bedrock, pgvector | **not from this repo** (#2163) | node `tsx --test`  |

Packages live in `packages/<name>` and are imported as `@govtech-bb/<name>`: `form-types` (Zod form
contract, canonical JSON, deploy-branch helpers), `registry` (built-in blocks, components, Barbados
ID patterns), `form-conditions`, `form-validation`, `expressions` (json-logic + luxon),
`form-builder` (recipe catalog, behaviours, authoring validation), `database` (TypeORM entities and
migrations), `git-publish` (GitHub contents and PR publishing), `content` (markdown loading, services
index), `ai-bedrock` (Bedrock model helpers), `analytics` (Umami event names, PII masking),
`umami-analytics` (Umami API client), `aws-secrets`, `admin-ui` (shared admin header). `scripts/` is
also an Nx project (`scripts`) with its own specs. The design system (`@govtech-bb/react`,
`@govtech-bb/frontend`, `@govtech-bb/styles`, `@govtech-bb/design`) is external npm, not part of
this repo.

**Session workflow (mandatory).** Before writing code for a piece of work, run `/bb:dev-start` with
the plan or issue as its pointer; when there is no plan yet, run `/bb:dev-plan` first. Before
committing a session's work, run `/bb:dev-finish`. These come from the `bb@team-skills` plugin
enabled in `.claude/settings.json`. If `/bb:dev-start` is not available, stop and tell the user to
enable the plugin (`/plugin marketplace add govtech-bb/team-skills`, then
`/plugin install bb@team-skills`). Do not improvise the steps.

**Form design skill (mandatory).** Before creating or editing a recipe under
`apps/api/src/forms/form-definitions/recipes/`, load `.claude/skills/form-design/SKILL.md` and
follow it. Do not write recipe JSON from memory. If you cannot load the skill, stop.

**Service page content skill (mandatory).** Before writing or editing a page under
`apps/landing/src/content/`, load `.claude/skills/service-page-content/SKILL.md` and follow it. Do
not write page copy from memory. If you cannot load the skill, stop.

**GitHub issue skill (mandatory).** Before `gh issue create` or `gh issue edit`, load
`.claude/skills/github-issue/SKILL.md` and follow it. Do not write the title, body or labels from
memory. If you cannot load the skill, stop.

**PR description skill (mandatory).** Before `gh pr create`, and after an agent `git push` to a
branch that already has an open PR, load `.claude/skills/pr-description/SKILL.md` and follow it. Do
not invent the title and body from memory. If you cannot load the skill, stop.

**Guidance travels with the change (mandatory).** When a change touches a surface that this file, a
nested `CLAUDE.md`, a skill under `.claude/skills/`, or `CONTRIBUTING.md` describes, update that
file in the same PR.

## Package Manager & Tooling

- **Package manager**: pnpm@11.6.0 (`packageManager` field; `corepack enable`). Run `pnpm install`
  before starting any task and again after every merge with `main` — pnpm's isolated linker
  (ADR 0004) makes a stale `node_modules` fail in ways that look like code errors.
- **Node**: 24 (`.nvmrc`).
- **Build system**: Nx 22 with no plugins — targets come from each project's `package.json` scripts
  and `project.json`; `nx affected` compares to `main` (`defaultBase`). Four apps have Nx names that
  differ from their directory (table above): `nx run form-builder-app:test`, not `form_builder:test`.
- **TypeScript**: project references. Root `tsconfig.json` references `form-types`,
  `form-conditions`, `form-validation`, `apps/forms` and `apps/api` (and, through them, the packages
  they reference); `landing` has its own `typecheck` target. Apps outside that graph
  (`form_builder`, `analytics`, `chat`, `feature_flagging`) are only type-checked when you run it
  yourself — see Common Commands.
- **Lint / format**: ESLint 9 flat config (`eslint.config.mts`; `apps/forms` and `apps/landing` carry
  their own) and Prettier.
- **Tests**: Vitest 4 everywhere except `apps/chat`, which runs node's test runner (`tsx --test`).
  Playwright in `apps/forms` (see `apps/forms/CLAUDE.md`).
- **Git hooks**: husky pre-commit runs lint-staged and gitleaks; pre-push is a deliberate no-op
  because CI's Type Check is the merge gate.

## Common Commands

```bash
# Pre-PR gate — the one command that mirrors CI (see Development Workflow)
pnpm test:pr

# Build and test
pnpm build                                   # nx run-many -t build
pnpm test:all                                # nx run-many -t test (scope it locally to avoid OOM)
pnpm exec nx run <project>:test              # one project: api, landing, form-builder-app, ...
pnpm exec nx affected -t lint build          # only what changed vs main
pnpm exec nx affected -t test --parallel=2

# Type check as CI does, plus the apps CI leaves out
pnpm typecheck                               # tsc -b && nx run landing:typecheck
pnpm exec tsc --noEmit -p apps/form_builder  # also: apps/analytics, apps/chat, apps/feature_flagging

# Dev servers
pnpm dev:forms                               # likewise dev:api, dev:landing
pnpm exec nx dev form-builder-app            # or form-builder-api, analytics-app, feature-flagging-app, chat

# Recipes and content
pnpm validate-recipes                        # schema + invariants for every recipe file (fastest gate)
pnpm validate-content-names                  # canonical names in landing content
pnpm check:generated                         # regenerate services-index + form-categories, fail on drift

# Database (api, TypeORM)
pnpm migration:generate -- <path>
pnpm migration:run                           # also migration:revert, migration:show

# Format
pnpm format
```

## Architecture

### Key files

- `apps/api/src/forms/form-definitions/recipes/<formId>.json` — form recipes, flat, one per form;
  copied into the api build as assets and validated at boot.
- `apps/landing/src/content/` — service pages (markdown + YAML frontmatter).
- `apps/form_builder_api/src/ai/system-prompt.ts` and `content-prompt.ts` — the live rulesets the
  `form-design` and `service-page-content` skills read before writing anything.
- `packages/form-types/src/deploy-branch.ts` — `fitBranchSegment`, `deployBranchLabel`,
  `formIdFromDeployBranch`: how the Form Builder names deploy branches and finds its open PRs.
- `packages/content/src/load-feature-routes.ts` — discovers landing's code-route feature modules
  (`src/routes/<url>/-meta.ts`) for the services index.
- `apps/api/src/content/services-index.generated.ts` and
  `packages/content/src/form-categories.generated.ts` — generated; never edit by hand.

### Deployment

Frontends (`forms`, `landing`, `form_builder`, `analytics`, `feature_flagging`) deploy on AWS
Amplify; `api` and `form_builder_api` run as containers on ECS/Fargate (api migrations run as a
one-off task first). `chat` is built and deployed by govtech-bb/govbb-chatbot; CI here still builds
its ingest image only because the ruleset requires the check (#2670).

Merging to `main` drives a sequential fan-out: **sandbox** deploys automatically → **staging**
deploys automatically once sandbox is fully green → **prod** is manual and windowed (Actions →
"Deploy Production" → Run workflow → Branch: `staging`). Full model:
[docs/trunk-based-development.md](docs/trunk-based-development.md).

## Development Workflow

### Trunk-based

`main` is the trunk and the only PR base. `sandbox`, `staging` and `prod` are deploy pointers the
pipeline fast-forwards — never develop on them, open PRs against them, or push to them. Merges to
`main` are gated by the "Main CI Required" ruleset (a PR plus green required checks; no human review
yet).

### Branch names

- **Never put a `.` in a branch name.** Each PR gets an Amplify preview at
  `<branch>.<appId>.amplifyapp.com` under a single-label wildcard cert; a dotted branch fails with
  `ERR_CERT_COMMON_NAME_INVALID`. Use `-`.
- **Keep the name to 63 characters once `/` becomes `-`.** The preview host is one DNS label; a
  longer name never resolves (`ERR_NAME_NOT_RESOLVED`) and the a11y and smoke gates fail on
  infrastructure, which reads as "flaky, merge anyway" (#2488).
- Both rules are enforced by `.claude/hooks/block-dotted-branch.sh` locally and the pr-preview
  "Guard branch name" step in CI. The Form Builder fits its own generated branches with
  `fitBranchSegment` — see `apps/form_builder/CLAUDE.md`.

### The per-change loop

1. Update `main`, run `pnpm install`, cut a short-lived branch.
2. `/bb:dev-start` (or `/bb:dev-plan` first). Keep the change small; write the failing test first.
3. `pnpm test:pr`. Fix red before moving on.
4. `/bb:dev-finish` — confirm it works, record decisions (ADR) and a session summary, commit.
5. Open the PR against `main` with the `pr-description` skill; wait for CI; merge on green.
6. If a deploy goes red, fixing it comes before new work.

### Pre-PR Quality Gate (MANDATORY)

Before committing, run the narrowest meaningful checks for your change and confirm they pass.
Before opening a PR or pushing for review, run what CI runs. The single canonical command is:

```bash
pnpm test:pr
```

It runs, in order: `pnpm lint:deps` (sherif), `pnpm typecheck` (`tsc -b` + `landing:typecheck`),
`nx affected -t lint build`, `nx affected -t test --parallel=2`, `pnpm validate-recipes`,
`pnpm validate-content-names`, `pnpm check:generated`. That is the CI set minus the checks only CI
can run: gitleaks (also in pre-commit when installed), CodeQL, zizmor, and the affected Docker image
builds.

If `test:pr` is too slow for the change, run at least the steps above that touch what you changed,
and say which ones ran. Do **not** commit or push while quality checks are failing unless the user
explicitly instructs otherwise; report the exact failing command and failure instead. Do not rely
on CI as your first signal — run locally, fix, then push.

### Tests

- Test-first: turn the task into a failing test, then make it pass (see `CONTRIBUTING.md`).
- Coverage thresholds track actuals and ratchet **up**, never down (ADR 0001, ADR 0003). `apps/api`
  enforces floors of 89/95/98/97 (branches/functions/lines/statements), so deleting a test fails CI.
- `apps/forms` smoke tests submit real applications — read `apps/forms/CLAUDE.md` before running
  anything but its default Playwright config.

## Important Conventions

### Monorepo build contract: new packages must be buildable AND referenced

Packages build with the strict `@nx/js:tsc` executor (`composite: true` + `rootDir`). When package A
imports package B (`@govtech-bb/B`), two things are required or the build fails with `TS6059` /
`TS6307` ("not under rootDir" / "not listed within the file list"):

1. **B must be a buildable Nx project** — a `project.json` with an `@nx/js:tsc` `build` target, so
   its declaration output is produced and built before A (pattern:
   `packages/form-types/project.json`, `packages/registry/project.json`).
2. **A's `tsconfig.json` must list B in `references`** — `"references": [{ "path": "../B" }]` — so
   tsc uses B's declarations instead of pulling B's source into A's program.

Library builds emit into the package's own `dist` (the api into `apps/api/dist`), so declarations
resolve their externals from that package's `node_modules`. pnpm uses its default isolated linker
(ADR 0004): a project only sees dependencies its own `package.json` declares, so declare every
import where it is used rather than relying on a sibling to pull it in. A package consumed only by
a Vite app can skip the build target — until a strict `tsc` library imports it, at which point both
requirements apply.

### Imports

Shared packages are imported as `@govtech-bb/<name>` (aliases in `tsconfig.base.json`). Avoid long
relative imports; if an alias is missing, ask before editing `tsconfig` paths.

### Generated files

`apps/api/src/content/services-index.generated.ts` and
`packages/content/src/form-categories.generated.ts` are regenerated from content by
`pnpm generate:services-index` and `pnpm generate:form-categories`; `pnpm check:generated` runs both
and fails on drift. CI's "Generated Files Up To Date" job regenerates and commits back onto the PR
branch when they drift — do it locally first.

### Secrets

Never read `.env*` files other than `.env.example`: a PreToolUse hook blocks shell reads and
`.claude/settings.json` denies the Read tool on them. Ask the user for a value instead.

### Issues and pull requests

`gh issue create` / `gh issue edit` go through the `github-issue` skill (assignee, labels, PM-style
body). `gh pr create` and later updates go through the `pr-description` skill. Neither adds a
"Generated with" footer.

## Documentation

- **Decision records** live in `docs/decisions/NNNN-kebab-slug.md`. The next number is the highest
  existing plus one (`ls docs/decisions | sort | tail -1`); historic numbers collide — never renumber
  or reuse one. Write an ADR when a choice is non-obvious or contested.
- **Session summaries** live in `docs/summaries/YYYY-MM-DD-slug.md`, one page per session.
  `/bb:dev-finish` writes both kinds.
- **Plans** live in `docs/plans/` and are never committed: the directory is deliberately
  un-gitignored so plans stay @-mentionable, and `.claude/hooks/block-commit-plans.sh` blocks
  staging them.
- Playbooks: [docs/trunk-based-development.md](docs/trunk-based-development.md),
  [docs/form-recipes.md](docs/form-recipes.md),
  [docs/accessibility-ci-gate.md](docs/accessibility-ci-gate.md).
- Nested `CLAUDE.md` files under `apps/*` and `.github/` carry the area-specific rules and load when
  you work there. Keep them, `README.md` and this file current with the surfaces they describe.

## Behavioral Guidelines

1. **Think before coding.** State assumptions; present competing interpretations instead of picking
   one silently; if something is unclear, stop and ask. Push back when a simpler approach exists.
2. **Simplicity first.** The minimum code that solves the problem — no speculative features,
   abstractions for single-use code, or configurability nobody asked for. If 200 lines could be 50,
   rewrite.
3. **Surgical changes.** Touch only what the task requires; match existing style; don't "improve"
   adjacent code. Remove only the orphans your own change created; mention other dead code, don't
   delete it. Every changed line should trace directly to the request.
4. **Goal-driven execution.** Turn the task into a verifiable goal ("fix the bug" → a test that
   reproduces it, then passes) and loop until it is met. For multi-step work, state a short plan
   with a check per step.

## Fast-moving libraries

TanStack Start, Router, Form, Query and AI, NestJS, TypeORM and the Bedrock SDK move fast, and the
form contract is shared across the monorepo. Do not write code for a pattern you have not just read
an example of: open the official example or the installed `.d.ts` in `node_modules` first, follow
it, and say which one you followed. `apps/chat/CLAUDE.md` names the TanStack AI examples to read.
