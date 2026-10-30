# Flaky v2 CI tests (#3404)

## Context

Two tests failed intermittently on PRs into `v2-rewrite`. One was `api_v2:test`, which failed on uncaught `57P01` errors even though every test passed. The other was the form_builder `-dev.assistant.spec.tsx` spec, which timed out waiting for "Apply to draft".

## What we did

- `apps/api_v2/src/test-db.ts` now gives the test pool a no-op `'error'` listener. `change-history.test.ts` adds the same listener to its second pool.
- `apps/api_v2/src/test-db.test.ts` reproduces the race on purpose: it drops a test database with force while the pool still holds an idle connection.
- In `-dev.assistant.spec.tsx`, each step waits up to 10 s instead of 2–5 s, and each test gets 30 s.

## Why we did it that way

- **A listener instead of waiting for disconnects.** `pool.end()` resolves before its idle clients have actually disconnected. `close()` then runs `drop … with (force)`, which terminates them, and pg re-emits the resulting error on the pool. That error is expected during teardown, so ignoring it is correct. The alternative was to make `close()` wait for the pool's `'remove'` events, which is more code for the same outcome. The listener only sees errors on idle clients, so a failing query still fails its test.
- **Higher timeouts instead of fake timers or injected delays.** The demo uses real `setTimeout` waits: 20 ms per step, a 400 ms pause, and 900 ms in `prepare`. Fake timers work badly with `userEvent` driving the real route. Injecting the delays would add a parameter to the demo code that only the test uses. The issue accepts the timeout change as the minimum fix.

## What we almost got wrong

The first version of the new test waited with `events.once(pool, "remove")`. `events.once` rejects when the emitter emits `'error'`, so the test still failed after the fix and looked as if the fix didn't work. It now uses a plain `pool.once("remove", …)` promise. It fails without the fix and passes with it.

## Open questions

- The form_builder fix can't be proven locally because the flake only appears under CI load. PRs into `v2-rewrite` don't run the full CI, so the issue's "10 green runs" criterion will have to come from later PRs.
