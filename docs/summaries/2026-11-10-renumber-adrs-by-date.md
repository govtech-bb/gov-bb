# Every ADR renumbered by date, v1 ones deprecated (#3120)

## Context

`docs/decisions/` on `v2-rewrite` held 135 ADRs, but 32 numbers were shared
by 87 files, so "ADR 0074" could name any of three decisions. Many ADRs
were also about v1 apps and still read as current guidance. The rule this
leaves behind is ADR 0136.

## What we did

- Renamed all 135 ADRs to `0001`–`0135` by the author time of the commit
  that first added each file (`git log --follow --diff-filter=A`), keeping
  slugs. Headings follow the filename. Three headings that had no number
  got one.
- Rewrote 1065 references in 414 tracked files: code, tests, `openapi.json`,
  editor_v2's `openapi.d.ts`, READMEs, summaries and specs. The "ADR NNNN"
  boot error in api_v2's `config.ts` and the two tests asserting on it
  changed together.
- Marked 103 ADRs about v1 apps Deprecated, keeping the old status after
  "Previously:".
- The old → new table is in the PR body only (user's call). ADR 0136
  points readers there.

## Why we did it that way

- **One pass over recorded spans, not the plan's two-phase tokens.** The
  scan stored the exact character range of every reference. The rewrite
  replaced them from the end of each file backwards and asserted the old
  text at each range. This avoids the same `0074 → 0075 → 0076` cascade
  that tokens prevent, and leaves no stray tokens to clean up.
- **References to a shared number were resolved in layers.**
  - A file that links exactly one candidate means that one.
  - Otherwise, a line written (by `git blame`) before the second candidate
    existed can only mean the first.
  - An ADR citing its own number means itself.
  - Subagents resolved the rest from context. All 409 resolutions were
    published as a page for the user's review before anything was
    written.
  - The blame rule is wrong when both ADRs came in the same PR. One case
    was overridden.
- **The plan's completeness grep was too narrow.** It only matched
  `ADR NNNN`. A wider scan found 73 bare four-digit references with no
  "ADR" in front, in markdown and after "supersedes" / "decision" in code.
  They were rewritten too.
- **Historical docs were rewritten too.** Summaries and specs now agree
  with the files on disk. The cost is that a summary's ADR number no
  longer matches the number in its own commit message. The PR's table
  decodes that.
- **Classification calls (user's):**
  - The chat ADRs keep their status.
  - The smoke-test and env ADRs count as repo-wide for now, and so does
    smoke submissions with zero side effects.
  - The landing ADRs were sorted one by one. Static-markdown content was
    deprecated. The four that govern api_v2 mode keep their status.
  - ADR 0110 (a `service_status` row overrides static visibility) keeps
    its status. It is about `apps/api`, but its "After cutover" section
    governs api_v2 mode, and api_v2's estate import cites it.
  - Superseded ADRs keep Superseded.
- **Snapshots didn't need `-u`.** `openapi.json` and `openapi.d.ts` went
  through the same rewrite. The api_v2 and editor_v2 openapi tests pass
  unchanged, so the files still match their generators.

## What we almost got wrong

- **17 references survived the first pass, in shapes the scan didn't
  match:**
  - a number that wrapped onto the next comment line after "ADR";
  - a shortened slug (`0007-…`, `0003-*`);
  - a bare `decisions/0005`;
  - a backticked `` decision `0050` ``.

  The PR review found 16 of them by diffing base against head for every
  old number left unchanged. That check is the one to trust, because it
  doesn't depend on the shape. The 17th was an `0001` meaning the
  recipe-draft ADR. It only turned up when every `0001`/`0002` was read by
  hand, because those old numbers are also valid new numbers.
- ADR 0110 was first deprecated as an `apps/api` ADR, despite its api_v2
  amendment. The review caught it.

- `apps/editor_v2/docs/decisions/` is a separate series, 0001–0007. Its
  references looked like gov-bb ADRs until a resolver noticed. They are
  untouched.
- A link whose text and path disagreed (text `0029`, path to the file then
  numbered `0030`) was first missed. So was one unpadded link text,
  `[45.`, fixed by hand.
- `editor_v2:build` fails in a worktree under `.claude/worktrees/`, because
  Node resolves `@tanstack/router-core` from the main checkout's stale
  `node_modules`. It builds from a clean copy of the base with this diff
  applied and CI's `VITE_API_ORIGIN`.

## Open questions

- An open `v2-rewrite` PR that adds an ADR (#2789) renumbers it on rebase,
  per ADR 0136.
- PRs on `main` that edit an ADR under its old name (#3534) meet the rename
  at the next `main` → `v2-rewrite` merge. Rename detection should carry
  the edit across. Check it at that merge.
- "Repo-wide for now" for the smoke and env ADRs may be revisited.
