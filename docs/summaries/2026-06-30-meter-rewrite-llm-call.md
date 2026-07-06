# Meter the chat rewrite LLM call (#1116)

**Issue:** [#1116](https://github.com/govtech-bb/gov-bb/issues/1116) —
enhancement, area:backend, subsystem:chat, severity:minor.

## What changed

`rewriteRetrievalQuery` (`apps/chat/src/lib/chat/rewrite.ts`) makes a small,
capped LLM call (`maxTokens: 100`, `REWRITE_MODEL`) to fold the conversation
into one retrieval query. Its token usage was never metered, so the
`GovBB/Chat` CloudWatch metrics under-counted Bedrock spend by the rewrite
call's tokens (gap noted in PR #1069).

`turn-metrics.ts` now has `buildRewriteMetrics(model, usage, now)` +
`emitRewriteMetrics(model, usage)` — a second EMF document under the same
`GovBB/Chat` namespace, dimensioned by `Model`, with distinct metric names
`RewritePromptTokens` / `RewriteCompletionTokens`. `rewrite.ts` attaches a tiny
`rewriteMetricsMiddleware` to its `chat()` call whose only hook is `onUsage`,
forwarding the reported tokens to the emitter.

## Why it looks the way it does

**Separate EMF document, not plumbed into `TurnRecord` (issue Option 1 over
Option 2).** The rewrite is a distinct `chat()` call, earlier in the request and
on a different (cheaper) model than the main turn. Threading its tokens into the
per-turn `TurnRecord` would mean carrying data out of `buildContext` into the
main turn-log middleware *and* updating the dashboard Cost-widget math
(alpha-infra#319, a separate repo). Option 1 is additive: a new metric simply
appears, nothing else changes. The trade-off — rewrite tokens live in their own
columns, so total spend is an addition on the dashboard — is acceptable for a
capped call and a severity:minor gap.

**Distinct metric names, not the issue's `RewriteTokens.Input/.Output`.** Kept
parity with the existing `PromptTokens`/`CompletionTokens` vocabulary
(`RewritePromptTokens`/`RewriteCompletionTokens`) so the metric set reads
consistently.

**`onUsage`-only middleware — the failure path needs no code.** Verified against
the installed `@tanstack/ai`: a structured `chat()` (with `outputSchema`, no
`stream:true`) resolves to just the parsed object — token usage is reachable
*only* via the `onUsage` middleware hook (the same mechanism `turnLogMiddleware`
uses). On timeout/failure `chat()` throws before usage is reported, so `onUsage`
never fires and nothing is emitted. That is exactly the wanted behaviour, with
no explicit error handling.

**`build` / `emit` split + injectable sink.** Mirrors the existing
`buildTurnMetrics`/`emitTurnMetrics` pair: the builder is pure (takes `now` as
an argument) so the test pins `Timestamp` and asserts the doc shape, and the
middleware's `sink` defaults to the prod-gated emitter but is overridable so the
test drives `onUsage` directly (the `turn-log.test.ts` pattern) without spinning
up a real `chat()`.

## Scope held

No `TurnRecord` change, no dashboard math, no change to the rewrite's behaviour
or its raw-message fallback. A dropped weak "construction emits nothing" test
was removed rather than left implying coverage of the failure path it didn't
actually exercise.

## Verification

`nx run chat:build` clean. `nx run chat:test` 168 tests, 0 fail (stable across
two runs). Touched test files pass 5/5.
