# Restart-safe editor-v2 handoff archive

This directory preserves the editor backlog requirements, historical verification notes and unreviewed recovery snapshots. Item status belongs in the tracker; historical test results apply to their recorded commits.

Library names have been removed from item descriptions and code comments in this archive.

## Start here

- [Backlog plan](../editor-v2-backlog.md): scope, dependencies, verification and decisions. Its initial context is historical; check the tracker before resuming an item.
- [TRACKER.md](TRACKER.md): status and evidence for all 88 items.
- [HANDOFF.md](HANDOFF.md): the historical starting snapshot.
- [BRIEF.md](BRIEF.md), [guidance/](guidance/), [packages/](packages/): shared implementation rules and package requirements.
- [BOARD.md](BOARD.md): full item specifications from the original 88 JSON files. Their status values are stale; use the tracker and verified commits instead.
- [BROWSER.md](BROWSER.md): the 15-suite local baseline and browser setup.
- [EXECUTION.md](EXECUTION.md), [WAVE1-REVIEW.md](WAVE1-REVIEW.md), [BASELINE-ISSUES.md](BASELINE-ISSUES.md): historical integration, review and regression evidence.

## Unreviewed WIP recovery

| Owner | Original HEAD | Recovery file | Untracked files included |
| --- | --- | --- | --- |
| frame / save state | `61300eb34986a66cf112fbfd00aeee33e0b0d32b` | [recovery/frame.md](recovery/frame.md) | 1 |
| nav / Services memory | `3be1e7497d62191c3f2e3595bed85308c0c2f46f` | [recovery/nav.md](recovery/nav.md) | 1 |
| write / Turn into | `63991d44bf047f96220ae9459f841609af0071b7` | [recovery/write.md](recovery/write.md) | 9 |
| forms / preview sheet | `bc40e9c4b9731051d901ba1309fcfa5eb43b654b` | [recovery/forms.md](recovery/forms.md) | 3 |

Each Markdown snapshot records `git status`, its base HEAD, the complete tracked `git diff HEAD --binary --full-index`, and the full contents of all untracked source/test files. Recover the fenced patch and untracked contents **after approval**, into an isolated checkout at the recorded base, then review/port the useful changes onto the current integration baseline. Do not overwrite the live original worktrees or treat a recovered patch as finished work.

The four pending commits and their history already live in the permanent repository's Git object store. Only their checkout directories were temporary. Preserve original branches until their reviewed changes are integrated and verified.

## Implementation constraints

Use existing GovBB components/tokens and existing installed dependencies. Keep styling changes scoped to the affected UI.
