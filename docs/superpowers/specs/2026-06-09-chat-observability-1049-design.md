# Chat Lambda emits CloudWatch metrics via EMF (#1049)

The chat goes live with zero custom operational visibility — no metrics for cost per turn, latency, error rate, or RAG retrieval-degraded fraction. Lambda's native `Invocations`, `Errors`, `Duration`, and `Throttles` cover the basics, but they don't answer the "is the chatbot expensive?" or "is the corpus covering enough?" questions. Add chat-specific CloudWatch metrics via the Embedded Metric Format (EMF) — emit them as structured JSON log lines, AWS picks them up automatically.

This is one half of #1049. The CloudWatch dashboard + alarms in `alpha-infra` are a follow-up: they depend on these metrics existing in the `GovBB/Chat` namespace before they can render or alert.

## Problem

When the chat is taking real traffic, we'll need to answer:

- **Is it expensive?** What's the Bedrock/Anthropic token spend per turn? Are we within budget?
- **Is it fast?** What's the time-to-completion per turn? Are users waiting too long?
- **Is the corpus complete?** What fraction of turns hit `(no relevant context found)` — the signal that we should add content (related: #1046)?
- **Is it broken?** Lambda native `Errors` covers HTTP-level failures, but doesn't tell us if RAG silently degrades.

Without metrics flowing, post-launch debugging is "users report it's broken" → 1-hour investigation per report. With them, we can build dashboards and alarms — but that's the follow-up; this PR ships the data layer.

## Decisions (locked during brainstorming)

| Dimension | Decision | Rejected alternatives |
|---|---|---|
| Scope this PR | Chat-code metric emission only (gov-bb). Dashboard + alarms become a follow-up alpha-infra issue. | Two-repo PR pair (delays this PR until alpha-infra is also ready); single PR with everything (long scope, hard to test cleanly). |
| Metric set | 4 metrics: `ChatTurn.LatencyMs`, `ChatTurn.LlmInputTokens`, `ChatTurn.LlmOutputTokens`, `ChatTurn.RetrievalDegraded`. | 5+ metrics adding `EmbedTokens` (Bedrock embed cost ~0.01% of LLM cost, not worth 4-layer plumbing); `RefusalEmitted` (heuristic detection fragile); `RequestBytes` (#1033 already logs this). |
| Emission strategy | EMF (Embedded Metric Format) — `console.log(JSON.stringify(payload))` with `_aws` envelope. CloudWatch picks up automatically. | AWS SDK `PutMetricData` (adds 50-200ms latency on critical path); third-party (Datadog/PostHog — SaaS dep + secrets). |
| File location | Existing `apps/chat/src/lib/chat/turn-log.ts` (already collects all 4 fields in `TurnRecord`). | New utility file (turn-log is already the right home; splitting would scatter related logic). |
| Token values | Reuse existing `promptTokens` / `completionTokens` from `chunk.usage` (already captured). | Re-instrument LLM call sites (redundant — withTurnLog already taps RUN_FINISHED). |
| Log-line prefix | Remove `[turn] ` text prefix; emit pure JSON so CloudWatch parses it as EMF. | Keep `[turn]` prefix and add a second EMF line (doubles log volume); keep prefix and break EMF parsing (kills the feature). |

## Design

### 1. Modify `apps/chat/src/lib/chat/turn-log.ts`

Two changes to one file:

**a. Add a `toEmf(record)` helper** that wraps `TurnRecord` in the EMF envelope and emits the 4 metric values + dimensions + non-metric searchability fields.

**b. Update `logTurn(rec)`** to emit `JSON.stringify(toEmf(rec))` instead of `[turn] ${JSON.stringify(rec)}`.

Code shape:

```ts
function toEmf(rec: TurnRecord): Record<string, unknown> {
  const metrics = [
    { Name: "ChatTurn.LatencyMs", Unit: "Milliseconds" },
    { Name: "ChatTurn.LlmInputTokens", Unit: "Count" },
    { Name: "ChatTurn.LlmOutputTokens", Unit: "Count" },
    { Name: "ChatTurn.RetrievalDegraded", Unit: "Count" },
  ];

  // EMF treats missing keys as no-op for that metric, so a partial turn
  // (LLM aborted mid-stream, no usage chunk) emits whatever was captured
  // without confusing CloudWatch.
  return {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: "GovBB/Chat",
          Dimensions: [["Service"]],
          Metrics: metrics,
        },
      ],
    },
    Service: "chat",
    ...(rec.durationMs !== undefined && { "ChatTurn.LatencyMs": rec.durationMs }),
    ...(rec.promptTokens !== undefined && { "ChatTurn.LlmInputTokens": rec.promptTokens }),
    ...(rec.completionTokens !== undefined && { "ChatTurn.LlmOutputTokens": rec.completionTokens }),
    "ChatTurn.RetrievalDegraded": rec.retrieveDegraded ? 1 : 0,
    // Non-metric fields kept for log-line searchability (CloudWatch Logs Insights):
    ts: rec.ts,
    threadId: rec.threadId,
    runId: rec.runId,
    model: rec.model,
    userChars: rec.userChars,
    formSlug: rec.formSlug,
    finishReason: rec.finishReason,
    cancelled: rec.cancelled,
    error: rec.error,
    retrieved: rec.retrieved,
  };
}

export function logTurn(rec: TurnRecord): void {
  console.log(JSON.stringify(toEmf(rec)));
}
```

That's the entire production change. ~30 lines added, ~1 line modified, zero new files.

### 2. Add unit test — `apps/chat/src/lib/chat/turn-log.test.ts`

Use `node:test` (the framework PR #1048 set up for `apps/chat`):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { toEmf } from "./turn-log";

test("toEmf emits all 4 chat metrics under GovBB/Chat namespace", () => {
  const rec = {
    ts: "2026-06-09T20:00:00Z",
    model: "claude-haiku",
    userChars: 50,
    retrieved: [],
    promptTokens: 1234,
    completionTokens: 567,
    durationMs: 4321,
    retrieveDegraded: false,
  };
  const emf = toEmf(rec);

  assert.equal((emf._aws as any).CloudWatchMetrics[0].Namespace, "GovBB/Chat");
  assert.equal(emf.Service, "chat");
  assert.equal(emf["ChatTurn.LatencyMs"], 4321);
  assert.equal(emf["ChatTurn.LlmInputTokens"], 1234);
  assert.equal(emf["ChatTurn.LlmOutputTokens"], 567);
  assert.equal(emf["ChatTurn.RetrievalDegraded"], 0);
});

test("toEmf omits metrics when underlying field is undefined", () => {
  const rec = {
    ts: "2026-06-09T20:00:00Z",
    model: "claude-haiku",
    userChars: 50,
    retrieved: [],
    retrieveDegraded: false,
    // No tokens, no durationMs (LLM aborted mid-stream case)
  };
  const emf = toEmf(rec);

  assert.equal(emf["ChatTurn.LatencyMs"], undefined);
  assert.equal(emf["ChatTurn.LlmInputTokens"], undefined);
  assert.equal(emf["ChatTurn.LlmOutputTokens"], undefined);
  // RetrievalDegraded always emitted (boolean → 0/1)
  assert.equal(emf["ChatTurn.RetrievalDegraded"], 0);
});

test("toEmf reports retrieveDegraded=true as metric value 1", () => {
  const rec = {
    ts: "2026-06-09T20:00:00Z",
    model: "claude-haiku",
    userChars: 50,
    retrieved: [],
    retrieveDegraded: true,
  };
  const emf = toEmf(rec);
  assert.equal(emf["ChatTurn.RetrievalDegraded"], 1);
});
```

To make `toEmf` testable, mark it as `export function toEmf(...)`.

### 3. Validation

**Pre-deploy:**
- Run `pnpm exec nx run chat:test` — unit tests pass.
- Run `pnpm exec nx run chat:build` — build succeeds.

**Post-deploy on PR preview:**
- Hit the preview chat with any query (e.g. "How do I get a birth certificate?").
- Check CloudWatch Logs for the chat Lambda — the log line should be a single JSON object containing `_aws`, `Service: "chat"`, and the 4 metric values.
- Wait 1-2 minutes for CloudWatch Metrics ingestion.
- Query the `GovBB/Chat` namespace in CloudWatch → confirm 4 new metrics appear:
  - `ChatTurn.LatencyMs`
  - `ChatTurn.LlmInputTokens`
  - `ChatTurn.LlmOutputTokens`
  - `ChatTurn.RetrievalDegraded`
- All with `Service=chat` dimension.

**Regression check:**
- No behavioural eval impact expected (this is observability, not chat behavior). But run `pnpm eval:responses` against the preview anyway — confirm 57/60 (or whatever today's baseline) holds.

## Alternatives considered

**Use AWS SDK `PutMetricData` instead of EMF.** *Rejected:* adds 50-200ms latency per turn (extra HTTP call). EMF emits via stdout — zero latency, AWS CloudWatch picks up the log line shape automatically. Standard Lambda pattern.

**Build a new utility file `apps/chat/src/lib/observability/emf.ts`.** *Rejected:* `turn-log.ts` already collects the data and emits the log. Splitting scatters related logic across files. The single-file change keeps the observability glue together.

**Add `EmbedTokens` (Bedrock Titan v2 embed input tokens) as a 5th metric.** *Rejected:* Bedrock Titan v2 embed cost is ~$0.000002 per typical query (10-50 tokens × $0.00002/1K). That's ~0.01% of the per-turn LLM cost. Instrumenting it would require plumbing through 4 layers (embed → fetchContext → run-turn → TurnRecord). Bad cost/benefit.

**Add `RefusalEmitted` as a 5th metric.** *Rejected:* detecting refusal reliably from output text is fragile. The current best signal is "no `[N]` markers in reply" (#989 finding), but that has false positives (e.g. greetings). File as a follow-up if a future dashboard run shows it'd be useful.

**Add per-error-code `ChatApi.Errors`.** *Rejected:* Lambda native `Errors` metric covers HTTP-level failures. The `error` field in `TurnRecord` is preserved in the log line for ad-hoc investigation. A custom error-code-by-dimension metric adds dimension cardinality cost ($0.30/metric-dimension-month) without clear win.

**Third-party observability (Datadog, PostHog).** *Rejected:* adds a SaaS dependency, new credentials, new IAM, network egress. EMF is already perfect for the use case.

## Out of scope / non-goals

| Not in this PR | When to revisit |
|---|---|
| CloudWatch dashboard in `alpha-infra` | Follow-up alpha-infra issue (file once this PR merges + deploys to sandbox). Depends on metrics existing. |
| CloudWatch alarms (cost spike, latency p95, error rate) | Same follow-up alpha-infra issue. |
| Distributed tracing (X-Ray, OpenTelemetry) | If/when we need cross-service trace correlation — chat is single-Lambda right now. |
| Per-user / per-session analytics | Privacy review needed first; not v1 scope. |
| Conversation transcripts in CloudWatch | Privacy review needed; current code explicitly avoids logging message content (see `run-turn.ts:243` comment). |
| `EmbedTokens`, `RefusalEmitted`, per-error-code `Errors` | If a future dashboard or post-launch incident reveals they'd help. |

## Workspace

Spec written on branch `feat/chat-observability-1049`, based on `origin/sandbox`. Implementation plan to follow under `docs/plans/` (not committed per CLAUDE.md). Final PR opens against `sandbox`.

Closes #1049 (the chat-code emission half). Follow-up alpha-infra issue for dashboard + alarms.
