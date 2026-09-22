---
name: github-issue
description: Use when creating or editing a GitHub issue in this repo, when about to run gh issue create or gh issue edit, when turning a finding, bug, failing check or TODO into an issue, or when the user says /github-issue, "open an issue", "file a bug", "make an issue for this". Don't use for PR descriptions (pr-description), issue comments, closing issues, or board-status labels.
---

# github-issue

Open an issue a product manager can act on: what is wrong or missing, who it affects, where it
lives, what to do, and how we know it is done. Then post it, assigned to the author.

Work from the code and the evidence, not from memory of the session.

## When to run

This skill is auto plus on demand.

Run it:

- Immediately before `gh issue create` or `gh issue edit`.
- When the user asks for an issue, or types `/github-issue`.
- When a finding, a failing check, a TODO or a spike needs tracking.

Do not run it for comments on existing issues, for closing issues, or to move an issue on the
board. `ready` and `progressing` belong to `/bb:dev-plan` and `/bb:dev-start`.

## Prerequisites

- `gh auth status` succeeds.
- Read `CONTRIBUTING.md` → "Reporting issues".

## Procedure

### 1. Ground

1. Search first: `gh issue list --state all --search "<keywords>" --limit 10`.
2. Read the code the issue is about. Collect `path:line` facts from files you actually opened.
3. Separate what you verified from what you only suspect.

<HARD-GATE>
An open issue already covers the problem: stop. Propose a comment on it, or an edit with
`gh issue edit`, and wait. Do not file a duplicate.
</HARD-GATE>

### 2. Classify

Pick one type label: `bug` | `enhancement` | `security` | `spike` | `documentation`.

Severity, for `bug` and `security` only:

| Label                | Rule                                                          |
| -------------------- | ------------------------------------------------------------- |
| `severity:critical`  | Live users blocked, data at risk, or a secret exposed         |
| `severity:important` | Wrong behaviour with a workaround, or a required CI check red |
| `severity:minor`     | Cosmetic, tech debt, or a flake with no user-facing effect    |

Then `area:*` from where the fix lands (`frontend`, `backend`, `infra`) and one or more
`subsystem:*` (`api`, `forms`, `form-builder`, `landing`, `chat`, `packages`, `ci`, `docker`,
`migrations`). Add `category:*` only for service-content issues. Pick labels from the issue's
content, not its title.

### 3. Title

One plain sentence naming the wrong or missing behaviour, in product terms. No `Bug:` or `Fix:`
prefix. Match the shape of `gh issue list --limit 15`. It must make sense on the board without the
body.

### 4. Body

Write in this order. Cite `path:line`. State only what you verified; mark anything else
"not verified". No diffs.

```markdown
## Problem

What is wrong or missing, for whom, under which inputs.

## Impact

Who feels it and how badly. A number when you have one.

## Where

`path/to/file.ts:123` — the code path, config or workflow involved.

## Proposed change

The smallest change that fixes it. Alternatives in one line each, if any.

## Acceptance criteria

- [ ] An observable check a reviewer can run or see
```

<HARD-GATE>
No acceptance criteria, or no `Where` entry from a file you opened yourself: stop and get them. Do
not post.
</HARD-GATE>

Never mention audits, tools, skills, sessions, plugins or the assistant. Describe the defect and
its impact the way a product manager would.

### 5. Labels

Pick only from `gh label list --limit 100`. Never invent one.

Never set at creation: `ready`, `progressing`, `BLOCKED`, `do not merge`, `EPIC`. The first two
are board-status labels owned by `/bb:dev-plan` and `/bb:dev-start`
(`scripts/project-board-sync.ts`).

### 6. Post

```bash
gh issue create --title "…" --body-file … --assignee @me \
  --label bug --label severity:important --label area:backend --label subsystem:api
```

Print the URL. Do not wait for approval of the text.

### 7. Edit path

`gh issue edit <n> --title "…" --body-file … --add-label …` under the same rules. Never remove
`ready` or `progressing`.

## Red flags

| You catch yourself                              | Do instead                           |
| ----------------------------------------------- | ------------------------------------ |
| Writing "found during an audit" or "the agent…" | Describe the defect and its impact.  |
| Adding `ready` or `progressing`                 | Leave them to the session skills.    |
| Inventing a label name                          | Pick from `gh label list`.           |
| A title starting with `Bug:` or `Fix:`          | Plain sentence naming the behaviour. |
| Severity from gut feel                          | Apply the table in step 2.           |
| Citing a file you did not open                  | Open it, or write "not verified".    |
| Filing without searching                        | `gh issue list --search` first.      |
| Skipping `--assignee @me`                       | Always assign the author.            |
