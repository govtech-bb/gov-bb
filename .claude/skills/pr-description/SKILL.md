---
name: pr-description
description: Use when writing a pull request title or body, when about to run gh pr create, when about to git push on a branch that already has an open PR, or when the user says /pr-description, "write the PR description", or "update the PR title". Don't use for commit messages, issue bodies (github-issue), or review comments.
---

# pr-description

Write the GitHub PR title and body from the diff, then post them. Do not wait for approval.

Work from the diff, not from memory.

## When to run

This skill is auto plus on demand.

Run it:

- When the user asks for a PR title or body, or types `/pr-description`.
- Immediately before `gh pr create`.
- Immediately after an **agent** `git push` on a branch that already has an open PR. Then run
  `gh pr edit` with a fresh title and body.

Do not run it on a human-only `git push` in another terminal. Do not add a git hook.

A later push must rewrite the GitHub text. Do not leave a stale description.

## Prerequisites

- Read `CONTRIBUTING.md` → "Branches and commits" and "Pull request flow".
- `gh auth status` succeeds.

Write the title and body with these rules:

1. Lead with the fact. No preamble, no "This PR aims to".
2. One idea per sentence.
3. Numbered steps for anything a reviewer does by hand.
4. Lists capped at five items.
5. Product and repo terms, not file lists.

## Procedure

### 1. Ground in the repo

1. The base is `main`. Read `git log --oneline origin/main..HEAD` and
   `git diff origin/main...HEAD`.
2. Read `.github/pull_request_template.md`.
3. Read about 15 recent titles: `gh pr list --limit 15 --state merged --json title`. Match that
   shape. Do not invent a new title style.
4. Collect linked issues from the branch name, commit messages, the plan file and any `Closes #`
   text.
5. List every guidance file whose surface the diff touches: `CLAUDE.md`, a nested `CLAUDE.md`, a
   skill under `.claude/skills/`, `CONTRIBUTING.md`.

<HARD-GATE>
The diff touches a surface a guidance file describes and that file is unchanged: stop. Update the
file, then continue.
</HARD-GATE>

### 2. Classify the PR

| Kind             | Signal                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| **fix**          | Restores broken behaviour. A user-visible bug, a failing check, a regression.                            |
| **feat**         | Adds behaviour that did not exist.                                                                       |
| **content**      | Recipes under `apps/api/src/forms/form-definitions/recipes/` or pages under `apps/landing/src/content/`. |
| **chore / docs** | CI, agent files, docs-only, refactors with no user-visible behaviour change.                             |

If more than one applies, the larger user-visible story wins. Say so in the lead.

### 3. Verification gate

<HARD-GATE>
`pnpm test:pr` ran green on this branch, or Verified names exactly which checks ran and which did
not. If nothing ran, stop and run the narrowest relevant checks first.
</HARD-GATE>

### 4. Write the title

An imperative sentence stating the outcome, 72 characters or fewer, matching the recent titles. A
`type(scope):` prefix is fine when the change is one project and recent titles use it; append
` (#N)` when recent titles do. The title must still make sense if the reviewer never opens the body.

### 5. Write the body

Lead line: `Closes #N.` and any relation (`Stacked on #M.`, `Follow-up to #K.`). Omit it when
nothing links. Then the template sections:

- **Problem** — what is wrong or missing, in product or repo terms.
- **Change** — what this PR does about it. Not a file list.
- **Verified** — commands run and their result; manual steps as a numbered list; what was not run
  and why. For a **fix**, step 1 is how to reproduce the old bug, then how to confirm it is gone.
- **Risk and rollback** — one line when low. Expand when the change touches deploy workflows, CI,
  recipes or live content: what could break, how to undo it.

Tick a checkbox only when the claim is true. Otherwise leave it unchecked and say so in Verified.

No "Generated with" footer. No co-author line in the body. No screenshots.

### 6. Post immediately

Do not wait for the user to approve the text.

- No PR yet: `gh pr create --base main --title "…" --body-file …`
- PR already open: `gh pr edit <n> --title "…" --body-file …`

If `gh` fails, stop and show the error. Leave the drafted body in the chat so it is not lost.

## Red flags

| You catch yourself                                      | Do instead                                      |
| ------------------------------------------------------- | ----------------------------------------------- |
| Writing the body from the branch name                   | Read the diff.                                  |
| Ticking `pnpm test:pr` you did not run                  | Leave it unchecked and say so in Verified.      |
| Inventing a title style                                 | Match the 15 recent titles.                     |
| A lead that lists files                                 | Rewrite as what changed for a user or the repo. |
| "I'll update the description later" after a push        | Rewrite now with `gh pr edit`.                  |
| Adding a "Generated with" footer or a co-author line    | Omit them.                                      |
| A CI, skill or CLAUDE.md change with no guidance update | Stop. Gate 1 failed.                            |
| Waiting for the user to approve the text                | Post. This skill does not wait.                 |
