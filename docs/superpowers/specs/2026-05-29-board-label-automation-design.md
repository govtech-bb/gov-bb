# Alpha² board label automation — design

**Date:** 2026-05-29 (updated 2026-06-02: added the **Closed** column)
**Status:** Approved (pending spec review)
**Project board:** [govtech-bb / Alpha² (#7)](https://github.com/orgs/govtech-bb/projects/7)
**Repo:** `govtech-bb/gov-bb`

## Goal

Drive the Alpha² Kanban board automatically from issue labels and pull-request
activity, so the board reflects real work state without manual column dragging.

Six behaviours are required:

0. A newly created issue lands in **Backlog**.
1. Adding the `ready` label moves the issue to **Ready**.
2. Adding the `progressing` label moves the issue to **In progress**.
3. Opening a PR that closes an issue (via a closing keyword) moves that issue to
   **In review**.
4. Merging such a PR into `sandbox` or `dev` moves the issue to **Done**, removes
   the `progressing` label, and closes the issue.
5. An issue holds at most one of `ready` / `progressing` at a time; merging also
   strips `progressing`.
6. Manually closing an issue as _completed_ moves it to **Done**. Closing it any
   other way — _not planned_, _duplicate_, or with no reason — moves it to
   **Closed**.

## Confirmed decisions

| Decision                      | Choice                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| Repo hosting the automation   | `govtech-bb/gov-bb` only                                    |
| Auth to write the org project | Org-owned **GitHub App** (durable, not tied to a person)    |
| PR → issue linkage            | GitHub **closing keywords** (`Closes #N` / `Fixes #N`) only |
| On merge to sandbox/dev       | Move to **Done** **and close** the issue                    |
| Architecture                  | Single custom GitHub Actions workflow (one source of truth) |

The board's `Status` field options match the requirements exactly:
**Backlog, Ready, In progress, In review, Done, Closed.**

## Architecture (Approach A)

One GitHub Actions workflow in `gov-bb` owns **all status transitions and the
issue close**. GitHub's built-in Projects workflows are reduced to board
_membership_ only. This keeps every status rule in one reviewable, versioned
file rather than split across unversioned board UI settings.

### Components

**1. GitHub App — `Alpha² Board Automation` (org-owned)**

- Permissions:
  - Organization → **Projects: Read & write** (update project item Status)
  - Repository → **Issues: Read & write** (read/remove labels, close issues)
  - Repository → **Pull requests: Read** (read closing-keyword references)
- Installed on `govtech-bb/gov-bb`.
- Repo secrets: `BOARD_BOT_APP_ID`, `BOARD_BOT_PRIVATE_KEY`.

`GITHUB_TOKEN` cannot write org-level Projects v2, which is why an App token is
required.

**2. Labels** (created once in `gov-bb`)

- `ready` — green `#0E8A16`
- `progressing` — yellow `#FBCA04`

**3. Workflow — `.github/workflows/project-automation.yml`**

- Mints an installation token via `actions/create-github-app-token@v2`.
- Single job; a thin `actions/github-script@v7` step that `require`s the logic
  module and receives the App token via `github-token`. No `pnpm install`
  (github-script bundles Octokit), so runs stay fast.
- `concurrency: { group: proj-sync-<issue-or-pr-number>, cancel-in-progress: false }`
  serialises events for the same item.

```yaml
on:
  issues:
    types: [opened, labeled, closed]
  pull_request:
    types: [opened, reopened, ready_for_review, closed]
```

**4. Logic module — `scripts/project-board-sync.js`**

- `decideActions(event)` — **pure** function: event payload → ordered list of
  intents (e.g. `{ setStatus: "Ready" }`, `{ removeLabel: "progressing" }`,
  `{ closeIssue: true }`). Unit-tested.
- `apply(octokit, projectMeta, issueRef, intents)` — runs the GraphQL/REST
  calls. Network side kept separate from the decision logic.

**5. Built-in Projects workflows**

- **Disable** (status-mutating — would fight our Action): #12 _Item added to
  project_, #7 _Item closed_, #8 _Pull request merged_, #11 _Pull request linked
  to issue_, #9 _Auto-close issue_. (#15 _Code changes requested_ is already
  disabled.)
- **Keep** (membership only): #13 _Auto-add to project_, #14 _Auto-add bug to
  project_, #10 _Auto-add sub-issues to project_.

## Behaviour

Every handler first calls `ensureItemOnBoard(issueId)` — an idempotent
`addProjectV2ItemById` — so a transition never fails on an issue not yet on the
board (including pre-existing issues).

| #   | Event                                             | Guard                                                             | Actions (ordered)                                                                        |
| --- | ------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0   | `issues.opened`                                   | —                                                                 | ensure on board → Status=**Backlog**                                                     |
| 1   | `issues.labeled`                                  | label == `ready`                                                  | remove `progressing` if present → ensure on board → Status=**Ready**                     |
| 2   | `issues.labeled`                                  | label == `progressing`                                            | remove `ready` if present → ensure on board → Status=**In progress**                     |
| 3   | `pull_request.{opened,reopened,ready_for_review}` | ≥1 closing-keyword issue                                          | per linked issue: ensure on board → Status=**In review**                                 |
| 4   | `pull_request.closed`                             | `merged == true` AND base ∈ {`sandbox`,`dev`} AND ≥1 linked issue | per linked issue: ensure on board → Status=**Done** → remove `progressing` → close issue |
| 5   | `issues.closed`                                   | `state_reason == completed`                                       | ensure on board → Status=**Done**                                                        |
| 6   | `issues.closed`                                   | `state_reason != completed` (not_planned / duplicate / none)      | ensure on board → Status=**Closed**                                                      |

### Mutual exclusion (behaviour 5)

Enforced on add: adding `ready` strips `progressing` and vice-versa, so an issue
never holds both. Removing the opposite label emits `issues.unlabeled`, which the
workflow does **not** subscribe to — no trigger loop.

### Edge cases

- **PR closed without merge** → no-op.
- **Merge to a base other than `sandbox`/`dev`** (feature branch, `main`) → no-op.
- **`dev` is the repo default branch**, so GitHub auto-closes the linked issue on
  a `dev` merge; our explicit close is idempotent. `sandbox` merges rely entirely
  on our explicit close.
- **Multiple closing references** in one PR → loop over all linked issues.
- **Label re-added when issue already In review/Done** → label rule fires and
  moves it back. Accepted: a human label action is authoritative.
- **Label removal** → no-op (we never move an issue backward on un-label).
- **Merge path also fires `issues.closed`** → the PR-merge handler (rule 4)
  closes the issue with an explicit `state_reason = completed`. That emits an
  `issues.closed` event handled by rule 5, which re-sets **Done** — idempotent,
  no conflict. The explicit reason is what keeps a merged issue out of the
  **Closed** column (rule 6 now catches every non-`completed` close).
- **Issue closed as "not planned" / "duplicate" / no reason** → moves to
  **Closed** (rule 6).
- **Empty closing-ref set** on a PR → `core.info` and clean exit, not a failure.

## GraphQL / REST operations

- **Resolve project metadata once per run:** `projectV2(number: 7)` → project node
  ID, `Status` field ID, and option ID per column name. Cached in-process.
  Resolving option IDs _by name_ means a column rename surfaces a clear
  "option not found" error rather than writing the wrong column.
- **Find item:** issue's `projectItems` → item ID on project #7; if absent,
  `addProjectV2ItemById` (returns existing item if present → idempotent).
- **Set status:** `updateProjectV2ItemFieldValue` with field ID + option ID.
- **Read PR links:** `pullRequest.closingIssuesReferences`.
- **Remove label:** REST `issues.removeLabel` (404 swallowed).
- **Close issue:** REST `issues.update { state: closed, state_reason: completed }`
  (no-op if already closed). The explicit `completed` reason routes the resulting
  `issues.closed` event to **Done**, not the **Closed** column.

All writes are idempotent — safe under event redelivery.

## Error handling

- Unexpected GraphQL/REST errors throw → the Actions run goes red and is visible.
- Expected "not found" cases (label already gone, issue already closed) are caught
  and ignored.
- No silent caps: empty/edge inputs are logged via `core.info`.

## Testing

- **jest** unit tests on `decideActions(event)` covering all six rules (including
  the non-`completed` close → **Closed**) plus edges: unmerged PR, wrong base
  branch, both-labels race, multi-ref PR, label-removal no-op. A unit test on
  `closeIssue` asserts the explicit `state_reason: completed`.
- The `apply()` network half is smoke-tested manually once after deploy, not
  mocked end-to-end.

## Rollout

1. Create the `ready` and `progressing` labels in `gov-bb`.
2. Create the `Alpha² Board Automation` GitHub App with the permissions above;
   install it on `gov-bb`.
3. Add `BOARD_BOT_APP_ID` and `BOARD_BOT_PRIVATE_KEY` repo secrets.
4. Disable the five status-mutating built-in Projects workflows (#7, #8, #9, #11,
   #12).
5. Merge `project-automation.yml` + `scripts/project-board-sync.js` + tests.
6. Smoke-test: open a throwaway issue (→ Backlog), add `ready` (→ Ready), add
   `progressing` (→ In progress, `ready` removed), open a PR with `Closes #N`
   (→ In review), merge to `sandbox` (→ Done, closed, `progressing` removed).

## Out of scope

- Automation in `govtech-bb/projects` (issues live in `gov-bb`).
- Loose `#N` mentions without a closing keyword.
- Moving issues backward on label removal.
- Priority/Size field automation.
