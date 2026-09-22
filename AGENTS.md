# AGENTS.md

Cross-agent pointer for this repository. `CLAUDE.md` is the canonical, full guide; this file only
routes.

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before analysing or changing anything. Its pull request
   and issue requirements apply to AI-assisted work.
2. Read [`CLAUDE.md`](CLAUDE.md) for the repository overview, commands, conventions and the pre-PR
   quality gate (`pnpm test:pr`).
3. Nested `CLAUDE.md` files under `apps/*` and `.github/` hold area-specific rules and apply when you
   work there.

## Mandatory gates

| Before you…                                                    | Load and follow                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| write code for a piece of work, or commit a session's work     | `/bb:dev-start`, `/bb:dev-plan`, `/bb:dev-finish` (plugin `bb@team-skills`) |
| create or edit a form recipe                                   | `.claude/skills/form-design/SKILL.md`                                       |
| write or edit a service page under `apps/landing/src/content/` | `.claude/skills/service-page-content/SKILL.md`                              |
| run `gh issue create` or `gh issue edit`                       | `.claude/skills/github-issue/SKILL.md`                                      |
| run `gh pr create`, or push to a branch that has an open PR    | `.claude/skills/pr-description/SKILL.md`                                    |

Use the Skill tool if your harness has one; otherwise Read the `SKILL.md` file. If you cannot load a
skill, stop and say so.

## Never

- Read `.env*` files other than `.env.example`.
- Develop on, open PRs against, or push to `sandbox`, `staging` or `prod`.
- Commit anything under `docs/plans/`.
