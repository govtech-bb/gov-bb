# Contributing

How we work in this repo. Most engineering here is **AI-assisted** (Claude Code
and similar agents), so these notes are as much about *how to drive an agent
well* as about human conventions. The authoritative rulebook is
[CLAUDE.md](CLAUDE.md) — this document explains the working style around it.

## AI-assisted development

[CLAUDE.md](CLAUDE.md) is the source of truth for behavioural guidelines and is
loaded into every agent session. Its load-bearing rules:

- **Think before coding** — state assumptions, surface trade-offs, ask when
  unclear rather than guessing.
- **Simplicity first** — the minimum code that solves the problem; nothing
  speculative.
- **Surgical changes** — touch only what the task requires; every changed line
  should trace to the request. Don't "improve" adjacent code.
- **Goal-driven execution** — turn a task into a verifiable goal and loop until
  it's met (see *Test-first*, below).

Best practices that have earned their keep:

- **Don't vibecode against fast-moving libraries.** For TanStack (Start/Router/
  Form/AI), Bedrock, and the shared form contract, read an example or the
  installed `.d.ts` before writing — don't recall the API from memory. See
  [apps/chat/CLAUDE.md](apps/chat/CLAUDE.md) for the canonical statement of this.
- **Scoped skills do the heavy lifting.** Domain workflows live as skills (e.g.
  form authoring in `.claude/skills/form-design/`); use them instead of
  re-deriving the process each time.
- **Verify before claiming done.** Run the build and the tests for what you
  touched before saying it works (see *Before you commit*).

### Capture the "why", not just the change

Two kinds of durable docs back this project's decisions — keep them current:

- **Decision records** — [`docs/decisions/`](docs/decisions/) (ADRs). When a
  choice is non-obvious or contested, write a short ADR so the reasoning
  outlives the PR. There are 100+; mirror their format.
- **Session summaries** — [`docs/summaries/`](docs/summaries/). A dated,
  one-page recap of what a work session changed and why. New work should leave
  one behind.

## Test-first working style

CLAUDE.md's *Goal-Driven Execution* is test-first in practice:

- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Add validation" → write tests for the invalid inputs, then make them pass.
- "Refactor X" → confirm tests pass before and after.

Tests run on **Vitest 4** (Jest has been removed); `apps/chat` uses the Node
test runner. The full suite is ~30s — run it freely:

```bash
pnpm exec nx run-many -t test          # everything
pnpm exec nx run <project>:test        # just one project
```

## How TDD drives coverage

Coverage is enforced per-project via Vitest `thresholds`, governed by two
decision records:

- **[ADR 0001](docs/decisions/0001-coverage-thresholds-track-actuals-not-targets.md)
  — thresholds track actuals, not targets.** Set a threshold 1–2 points *below*
  measured coverage. Its job is to catch regressions, not declare an aspiration.
- **[ADR 0003](docs/decisions/0003-90pct-coverage-target-and-exemptions.md)
  — 90% target, exemptions, and the ratchet policy.** As test-first work raises
  real coverage, thresholds ratchet **up** toward 90% and never slip back. Some
  paths carry documented structural exemptions (e.g. `form-types` exports Zod
  schemas, not callable functions; the `forms` renderer is covered by Playwright
  journeys, not unit tests).

The practical loop: writing the failing test first raises the measured number,
the ratchet locks it in, and the threshold only ever moves up. Coverage is an
*output* of the test-first discipline, not a separate chore.

> The coverage ADRs predate the Jest→Vitest migration and reference
> `jest.config.ts`; the policy is unchanged — it now rides on each project's
> `vitest.config.ts`.

## Before you commit

CI runs the full build and test suite — run them locally first:

```bash
pnpm exec nx run-many -t build --exclude=landing   # landing's prebuild needs a live API
pnpm exec nx run <project>:test                    # tests for what you touched
```

## Commits & pull requests

- **Conventional commits** — `type(scope): summary`, e.g.
  `feat(forms): …`, `fix(landing): …`, `refactor(api): …`.
- **Credit the agent** — AI-assisted commits carry a trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **PRs target `sandbox`** (the integration branch), not `main` or `dev`.
- **No `.` in branch names** — Amplify's per-PR preview cert is a single-label
  wildcard, so a dotted branch breaks HTTPS on the preview. Use `-`. This is
  enforced in CI and by a local pre-commit hook. See [CLAUDE.md](CLAUDE.md).
