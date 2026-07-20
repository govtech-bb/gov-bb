# SQS consumer graceful shutdown

**Issue:** [#1746](https://github.com/govtech-bb/gov-bb/issues/1746) —
[Important] SQS consumer has no graceful shutdown; in-flight submissions can be
dropped or reprocessed on deploy.

## What changed

- `apps/api/src/main.ts`: added `app.enableShutdownHooks()`.
- `apps/api/src/forms/submissions/sqs/sqs-consumer.service.ts`: keep a handle to
  the poll loop (`this.loop`), make `onApplicationShutdown()` async (stop →
  drain the in-flight iteration bounded by a 30s timeout → `client.destroy()`),
  and break out of the loop after `receive` if shutdown was requested during the
  long-poll wait.
- Tests for the four shutdown behaviours; updated one existing poll-loop test
  whose setup relied on the old "process a batch even though running is false"
  behaviour.
- Decision record [0062](../decisions/0062-background-consumers-drain-on-shutdown.md).

## Why it looks the way it does

**The hidden root cause was in `main.ts`, not the service.** The issue framed
this as a service bug, but `onApplicationShutdown()` never fired at all because
`enableShutdownHooks()` was never called — NestJS silently no-ops lifecycle
shutdown hooks otherwise. Fixing only the service would have been cosmetic. We
scoped the PR to include the `main.ts` line on the user's call, since without it
the fix is dead code.

**Drain via `Promise.race` with a cancellable timer, not `await this.loop`.** A
bare `await` on the loop would let a single stuck `process()` freeze shutdown
forever — the deploy platform would then hard-kill the process, which is worse
than a bounded, logged exit. We race the loop against a 30s timer (chosen above
the 20s long-poll window so a normal in-flight receive has room to complete) and
`clearTimeout` the loser so the winning-loop path doesn't leave a dangling timer
keeping the worker alive — the existing tests explicitly worried about timer
leaks, so this mattered.

**Re-check `running` after `receive`, and leave the batch for redelivery.**
Shutdown can be requested during the 20s long-poll wait, so a batch can arrive
*after* we've decided to stop. Rather than start work we can't guarantee to
finish, we `break` and leave those messages untouched — not deleting an SQS
message is safe (it redelivers), whereas half-processing is exactly what caused
the duplicate-side-effect bug. This trades a small amount of redelivered work
for correctness.

**Timeout is a hardcoded constant, not env config.** The issue never asked for
configurability; a documented `DRAIN_TIMEOUT_MS = 30_000` constant keeps it
simple and easy to change if the deploy grace period ever turns out shorter.

## Open questions

None. The 30s value is a judgement call, easy to revisit if the container's
SIGTERM→SIGKILL grace period is found to be tighter.
