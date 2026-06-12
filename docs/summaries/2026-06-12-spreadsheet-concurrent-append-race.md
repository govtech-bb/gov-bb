# Spreadsheet processor: serialize concurrent appends to a shared file

## Context

Issue [#702](https://github.com/govtech-bb/gov-bb/issues/702)
(`bug`, `area:backend`, `subsystem:api`, `severity:minor`). The SQS consumer
processes each received batch with `Promise.all(...processMessage)`, so multiple
submission messages run concurrently in one process. `SpreadsheetProcessor`
does an unguarded `readFile → in-memory dedup scan → addRow → writeFile` on a
recipe-supplied `<filename>.xlsx`. Two writers targeting the same file can both
`readFile` before either `writeFile`s; the second write clobbers the first — a
lost row. The `${submissionId}:${index}` dedup token (ADR 0031) made *retries*
safe but does nothing for concurrent *first*-writes, because the racing reads
never see each other's not-yet-written token. Worked from
`docs/plans/702-spreadsheet-concurrent-append-race.md`.

## What we did

- Added a private `Map<filePath, Promise>` and a `withFileLock(filePath, fn)`
  helper to `SpreadsheetProcessor`: a per-resolved-path serial queue. Each call
  chains onto the prior call for the *same* resolved path, so the whole
  read-modify-write critical section runs under the lock.
- Split the old `processEntry` body into `appendEntry` (the critical section)
  and wrapped it in `withFileLock`, keyed on the resolved `filePath` (after
  `basename`/`join`).
- Rewrote the NOTE comment — the concurrent-write race is now closed in-process;
  recorded the single-writer-per-file assumption that makes it sufficient and
  the EFS-cross-process caveat.
- Added four tests (TDD, written RED first): a mock-based serialization
  invariant (`maxActive` never exceeds 1), a **real-ExcelJS** end-to-end test in
  a separate spec file (no global `jest.mock`, real `os.tmpdir()` file) that
  proves both rows persist, a "different files stay parallel" test, and an
  error-isolation test.
- Recorded the topology constraint in ADR 0053.

## Why we did it that way

- **In-process lock, not cross-process file locking (confirmed with author).**
  The deployment topology is single-writer-per-file — a given `.xlsx` is only
  ever written by one process. An in-process per-path serializer therefore
  *fully* closes the race; EFS file-locks / an atomic append store would be
  necessary only if multiple processes shared an export dir. That's out of scope
  for `severity:minor` and is flagged (NOTE comment + ADR 0053) so a future infra
  change can't silently reintroduce the bug.

- **Lock lives in the processor, not the consumer.** The processor owns the file
  resource, the NestJS provider is a singleton (so the map is shared across the
  concurrent `Promise.all`), and this also covers the direct (non-SQS) invocation
  path.

- **Hand-rolled keyed queue over `async-mutex`/`p-limit`.** Neither gives
  keyed-by-string locking for free, so we'd still maintain the `Map` by hand; the
  dependency buys little.

- **Error isolation is deliberate.** The chain advances on the prior turn's
  *settlement* (success or failure): a throwing turn propagates to its own caller
  (the consumer relies on this to NACK and let SQS retry) but does not break the
  chain for the next waiter. The stored tail is a `.then(noop, noop)` so it never
  rejects; the map entry is deleted once its chain drains (identity-guarded
  against a later turn that replaced it), keeping the map bounded.

- **Real-ExcelJS test in its own file.** The main spec has a module-global
  `jest.mock("exceljs")`; a mock can't faithfully reproduce a read-modify-write
  lost update. The separate file runs real ExcelJS against a real temp file — it
  failed RED (only the second submission's row survived) and passes GREEN, which
  is the actual proof of the fix.

## Verification

`pnpm exec nx run api:test` → 807 passed · `pnpm exec nx run-many -t build
--exclude=landing,cms` → 13 projects · `pnpm exec tsc -b` → clean.

## Process note

Local checkout was 62 commits behind `origin/sandbox`; worked in a worktree
reset to fresh `origin/sandbox` (the touched files were byte-identical, so no
drift). Early edits accidentally landed in the main checkout (file paths captured
by Read before `EnterWorktree`); moved them into the worktree and reverted the
main checkout, leaving only the user's pre-existing changes.
