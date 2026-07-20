# 2026-07-10 — #1531: tolerate transient poll failures in `pollUntilDone`

## Context

Issue #1531: a single transient 502/503 during the 1–3 minute AI job poll
(PDF upload) killed the job and forced the user to re-run a billed
Textract + Bedrock pipeline. Plan:
`docs/plans/1531-poll-retry-consecutive-failures.md` (session-local, not
committed). Executed TDD in a worktree off `main`.

## What we did

- Wrapped the `getStatus()` call inside `pollUntilDone`
  (`apps/form_builder/app/routes/builder/-ai-sidebar.tsx`) in a try/catch
  with a `consecutiveFailures` counter: rethrow on the 3rd consecutive
  rejection, `continue` otherwise, reset to 0 on any successful poll.
- Two new fake-timer tests in `-ai-sidebar.spec.tsx` (recover after 2
  failures; surface after 3), and converted the existing expired-session
  (404) test to fake timers.

## Why we did it that way

- **Fix in the shared helper, not the callers.** The issue body predates a
  refactor that extracted the polling loop into `pollUntilDone`, shared by
  both `handleUpload` and `handleEditForm`. Retrying inside each caller (as
  the issue sketches) would duplicate the logic and miss the edit path.
- **No new backoff/deadline machinery.** The loop's existing `intervalMs`
  sleep is the backoff, and the `timeoutMs` check still bounds total time —
  retries never extend the overall deadline. Abort checks stay at the top of
  the loop, so cancel/unmount still wins over any retry.
- **Consecutive, not cumulative.** A success resets the counter; only a
  sustained outage (3 failed polls ≈ 6s dark) surfaces an error. Blips are
  invisible to the user.
- **Behavioural cost accepted:** *every* poll error — including a permanent
  one like the expired-session 404 — now takes 3 polls (~4.4s on the edit
  cadence) to surface. We accepted the slower surfacing of permanent errors
  over discriminating error types, which would couple the helper to API
  client error shapes. This is why the existing 404 test had to move to fake
  timers: the error now lands outside the real-timer 1s `findByRole` window.

## What we almost got wrong

- The first version of the tests was accidentally written to the **main
  checkout** instead of the worktree (absolute-path trap after
  EnterWorktree), which made the RED run silently test the wrong tree — the
  filter matched nothing and unrelated tests passed. Caught by listing which
  tests actually ran; the edit was moved into the worktree and the main
  checkout reverted.

## Open questions

None.
