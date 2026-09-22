# Contributing

How we work in this repo. Most engineering here is **AI-assisted** (Claude Code and similar
agents), so these notes cover _how to drive an agent well_ as much as human conventions. The
authoritative rulebook is [CLAUDE.md](CLAUDE.md) — every agent session loads it — and
[AGENTS.md](AGENTS.md) routes other tools to it. This document explains the working style around
them.

## Before you start

- Search the open and closed issues and pull requests before starting work, so you do not duplicate
  a report or a fix.
- Keep each pull request focused on one change. Unrelated changes get split.
- You may use an agent to write code. You remain responsible for understanding, testing and
  verifying every line you submit.

## Prerequisites

- Node.js 24 (`.nvmrc`).
- pnpm 11.6.0 — `corepack enable` picks up the `packageManager` pin. Use pnpm for everything; never
  `npm` or `yarn`.
- Optional: [gitleaks](https://github.com/gitleaks/gitleaks) on your PATH, so the pre-commit hook can
  scan for secrets locally (CI scans regardless).

## Initial setup

```bash
pnpm install
pnpm exec nx run-many -t build
```

Postgres for the api comes from `docker-compose.yml`; environment variables are listed in
[README.md](README.md#environment-variables). Run `pnpm install` again after every merge with
`main` — pnpm's isolated linker makes a stale `node_modules` look like a code error.

## Repository layout

[README.md](README.md#project-structure) lists every app and package; [CLAUDE.md](CLAUDE.md) →
"Repository Overview" adds the Nx project names, stacks and deploy targets. Nested `CLAUDE.md`
files under `apps/*` and `.github/` hold the area-specific rules.

## Day-to-day commands

| Command                               | What it does                                               |
| ------------------------------------- | ---------------------------------------------------------- |
| `pnpm test:pr`                        | Everything CI runs that can run locally — the pre-PR gate  |
| `pnpm typecheck`                      | `tsc -b` plus `landing:typecheck`, as CI's Type Check does |
| `pnpm exec nx run <project>:test`     | Tests for one project                                      |
| `pnpm exec nx affected -t lint build` | Only what changed against `main`                           |
| `pnpm validate-recipes`               | Schema and invariants for every recipe file                |
| `pnpm check:generated`                | Regenerate the two generated indexes and fail on drift     |
| `pnpm format`                         | Prettier                                                   |

The full list is in [CLAUDE.md](CLAUDE.md) → "Common Commands" and the README scripts table.

## AI-assisted development

[CLAUDE.md](CLAUDE.md) is the source of truth for behavioural guidelines. Its load-bearing rules:

- **Think before coding** — state assumptions, surface trade-offs, ask when unclear rather than
  guessing.
- **Simplicity first** — the minimum code that solves the problem; nothing speculative.
- **Surgical changes** — touch only what the task requires; every changed line should trace to the
  request. Don't "improve" adjacent code.
- **Goal-driven execution** — turn a task into a verifiable goal and loop until it's met (see
  _Test-first_, below).

Practices that have earned their keep:

- **Session skills.** The `bb@team-skills` plugin (enabled in `.claude/settings.json`) provides
  `/bb:dev-start`, `/bb:dev-plan` and `/bb:dev-finish`. They orient, plan, verify, record decisions
  and commit the same way every time. Use them.
- **Repo skills do the domain work.** `.claude/skills/form-design` (recipes),
  `service-page-content` (service pages), `github-issue` (issues) and `pr-description` (PRs) are
  mandatory gates; CLAUDE.md says when each fires. Use them instead of re-deriving the process.
- **Don't vibecode against fast-moving libraries.** For TanStack (Start/Router/Form/AI), NestJS,
  TypeORM, Bedrock and the shared form contract, read an official example or the installed `.d.ts`
  before writing — never recall the API from memory.
- **Verify before claiming done.** Run `pnpm test:pr` (or the relevant subset, and say which) before
  saying it works.
- **Guidance travels with the change.** If your change touches a surface that CLAUDE.md, a nested
  CLAUDE.md, a skill or this file describes, update that file in the same PR.

### Capture the "why", not just the change

- **Decision records** — [`docs/decisions/`](docs/decisions/) (ADRs, `NNNN-slug.md`). When a choice
  is non-obvious or contested, write a short ADR so the reasoning outlives the PR. Take the next
  number after the highest existing one; historic numbers collide, never renumber.
- **Session summaries** — [`docs/summaries/`](docs/summaries/), a dated one-page recap of what a
  session changed and why. `/bb:dev-finish` writes both.
- **Plans** — [`docs/plans/`](docs/plans/) hold session plans and are never committed (a hook blocks
  it).

## Test-first working style

_Goal-driven execution_ is test-first in practice:

- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Add validation" → write tests for the invalid inputs, then make them pass.
- "Refactor X" → confirm tests pass before and after.

Tests run on **Vitest 4**, except `apps/chat`, which uses node's test runner (`tsx --test`). Scope
runs to what you touched (`pnpm exec nx run <project>:test`); the whole suite can OOM a laptop.

## How TDD drives coverage

Coverage is enforced per project via Vitest `thresholds`, governed by two decision records:

- **[ADR 0001](docs/decisions/0001-coverage-thresholds-track-actuals-not-targets.md) — thresholds
  track actuals, not targets.** Set a threshold 1–2 points _below_ measured coverage. Its job is to
  catch regressions, not declare an aspiration.
- **[ADR 0003](docs/decisions/0003-90pct-coverage-target-and-exemptions.md) — 90% target,
  exemptions, and the ratchet policy.** As test-first work raises real coverage, thresholds ratchet
  **up** toward 90% and never slip back. Some paths carry documented structural exemptions (e.g.
  `form-types` exports Zod schemas, not callable functions; the `forms` renderer is covered by
  Playwright journeys, not unit tests).

Writing the failing test first raises the measured number, the ratchet locks it in, and the
threshold only ever moves up. Coverage is an _output_ of the discipline, not a separate chore.

## Before you commit

```bash
pnpm test:pr
```

It runs what CI runs (sherif, `tsc -b`, `landing:typecheck`, affected lint/build/test, recipe and
content validation, generated-file drift). Only CI can run the gitleaks history scan, CodeQL, zizmor
and the Docker image builds. Do not commit or push with checks failing; fix them, or say exactly
what failed and why.

## Branches and commits

- Branch off `main`. `sandbox`, `staging` and `prod` are deploy pointers, never workspaces.
- **No `.` in branch names**, and keep them to 63 characters once `/` becomes `-` — Amplify's
  per-PR preview breaks otherwise. A local hook and the pr-preview guard enforce both.
- Commit subjects are a short imperative sentence. A `type(scope):` prefix (`fix(recipes): …`) is
  welcome but not required; match recent `git log`.
- A `Co-Authored-By: Claude <noreply@anthropic.com>` trailer on AI-assisted commits is allowed, not
  required. PR bodies carry no "Generated with" footer.

## Pull request flow

1. Push your branch and open a PR **against `main`** (agents: through the `pr-description` skill).
2. Fill the template — Problem, Change, Verified, Risk and rollback — and tick only the boxes that
   are true.
3. CI runs the "Main CI Required" checks: Type Check, Test, Build, Lint, Secrets Scan, Security
   Scan, Validate Recipes, Validate Content, Generated Files Up To Date, zizmor and the affected
   Docker builds. Amplify previews build for forms, landing, chat, form-builder and analytics, with
   the forms smoke and a11y scans against the preview.
4. Merge on green (no human review is required yet). Delete the branch.
5. `sandbox` deploys automatically; `staging` follows once sandbox is green; `prod` is a manual,
   windowed deploy from `staging`. See
   [docs/trunk-based-development.md](docs/trunk-based-development.md).

## Reporting issues

Agents open issues through the `github-issue` skill; humans follow the same shape: a plain
sentence title, then **Problem**, **Impact**, **Where**, **Proposed change**, **Acceptance
criteria**. Assign yourself and pick labels from the existing set — type, `severity:*` for bugs,
`area:*`, `subsystem:*`. Leave `ready` and `progressing` to the board automation.
