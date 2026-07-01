# 0062 — Background consumers drain in-flight work on shutdown

## Context

`apps/api` runs long-lived background loops that pull work off SQS — currently
the submission consumer (`SqsConsumerService`), which does `receive → process →
deleteMessage` in a `while` loop. These loops outlive any single request and are
driven by NestJS lifecycle hooks rather than the HTTP layer.

Two gaps made shutdown unsafe (issue #1746):

- The app never called `app.enableShutdownHooks()`, so
  `onApplicationShutdown()` **never fired at all** on `SIGTERM`/`SIGINT`. The
  process was simply killed on deploy. This is a silent trap: a lifecycle
  cleanup method looks wired up, compiles, and does nothing.
- The consumer started its loop fire-and-forget (`void this.pollQueue(...)`) and
  shutdown only flipped a boolean. It never awaited the in-flight iteration or
  closed the SQS client, so a message mid-processing could be dropped (killed
  before `deleteMessage`) or reprocessed (visibility timeout expired →
  redelivered → duplicate email/webhook).

## Decision

Long-running background consumers in `apps/api` must shut down gracefully:

1. **Shutdown hooks are enabled once, app-wide.** `main.ts` calls
   `app.enableShutdownHooks()`. Any lifecycle cleanup (`onApplicationShutdown`,
   `onModuleDestroy`) depends on this — it is a precondition, not per-service.
2. **Keep a handle to the loop.** Start the poll loop as
   `this.loop = this.pollQueue(...)`, never `void`, so shutdown has something to
   await.
3. **Drain, bounded by a timeout.** `onApplicationShutdown()` sets the stop flag,
   awaits the loop, and closes the client — but the drain is bounded (SQS
   consumer uses 30s, above its 20s long-poll window) so a stuck `process()`
   cannot block shutdown forever. On timeout, log and leave the work for
   redelivery.
4. **Don't start work you can't finish.** After a blocking `receive`, re-check
   the stop flag before processing; if shutdown was requested during the wait,
   leave the batch untouched so the queue redelivers it cleanly.

## Consequences

- A new background consumer/poller must follow this shape: loop handle, flag +
  bounded drain on shutdown, client close, and a re-check after any blocking
  receive. Reviewers should treat a fire-and-forget loop or a shutdown that only
  flips a boolean as a defect.
- Nobody should rely on `onApplicationShutdown`/`onModuleDestroy` without
  confirming `enableShutdownHooks()` is called — removing that one line silently
  disables every lifecycle cleanup in the app.
- "Leave it for redelivery" is the correct default on shutdown: not deleting an
  SQS message is safe (it reappears), whereas half-finishing it is what produces
  duplicate side-effects. This assumes downstream processors are safe to retry.
