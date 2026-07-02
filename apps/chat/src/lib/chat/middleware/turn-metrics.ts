import type { TurnRecord } from "./turn-log";

// CloudWatch Embedded Metric Format. One JSON log line that CloudWatch Logs
// auto-extracts into metrics — no SDK, no agent config. Built from the same
// TurnRecord turn-log emits, and dimensioned by Model only: low cardinality,
// and per-model cost/latency is the split that matters when the Bedrock model
// changes.
const NAMESPACE = "GovBB/Chat";

export interface TurnMetricsDoc {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: {
      Namespace: string;
      Dimensions: string[][];
      Metrics: { Name: string; Unit: string }[];
    }[];
  };
  Model: string;
  TurnDurationMs: number;
  PromptTokens: number;
  CompletionTokens: number;
  TurnErrors: number;
  TurnsCancelled: number;
  RetrieveDegraded: number;
  ToolFailures: number;
}

export function buildTurnMetrics(rec: TurnRecord, now: number): TurnMetricsDoc {
  return {
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [["Model"]],
          Metrics: [
            { Name: "TurnDurationMs", Unit: "Milliseconds" },
            { Name: "PromptTokens", Unit: "Count" },
            { Name: "CompletionTokens", Unit: "Count" },
            { Name: "TurnErrors", Unit: "Count" },
            { Name: "TurnsCancelled", Unit: "Count" },
            { Name: "RetrieveDegraded", Unit: "Count" },
            { Name: "ToolFailures", Unit: "Count" },
          ],
        },
      ],
    },
    Model: rec.model,
    TurnDurationMs: rec.durationMs ?? 0,
    PromptTokens: rec.promptTokens ?? 0,
    CompletionTokens: rec.completionTokens ?? 0,
    TurnErrors: rec.error ? 1 : 0,
    TurnsCancelled: rec.cancelled ? 1 : 0,
    RetrieveDegraded: rec.retrieveDegraded ? 1 : 0,
    ToolFailures: rec.toolFailures ?? 0,
  };
}

// EMF lines only mean anything in CloudWatch, so skip the console noise outside
// production (dev runs the same turn path).
export function emitTurnMetrics(rec: TurnRecord): void {
  if (process.env.NODE_ENV !== "production") return;
  console.log(JSON.stringify(buildTurnMetrics(rec, Date.now())));
}

// The query-rewrite call (rewrite.ts) is a separate, capped LLM call whose
// tokens the per-turn record above does not cover (#1116). It's metered as its
// own EMF document — same namespace, dimensioned by Model (the REWRITE_MODEL,
// which differs from the turn model) — with distinct metric names so it never
// muddles the per-turn PromptTokens/CompletionTokens.
export interface RewriteMetricsDoc {
  _aws: TurnMetricsDoc["_aws"];
  Model: string;
  RewritePromptTokens: number;
  RewriteCompletionTokens: number;
}

// The token counts the rewrite call reports via its onUsage hook — the only
// fields we meter from it.
export interface RewriteUsage {
  promptTokens: number;
  completionTokens: number;
}

export function buildRewriteMetrics(
  model: string,
  usage: RewriteUsage,
  now: number,
): RewriteMetricsDoc {
  return {
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [["Model"]],
          Metrics: [
            { Name: "RewritePromptTokens", Unit: "Count" },
            { Name: "RewriteCompletionTokens", Unit: "Count" },
          ],
        },
      ],
    },
    Model: model,
    RewritePromptTokens: usage.promptTokens,
    RewriteCompletionTokens: usage.completionTokens,
  };
}

export function emitRewriteMetrics(model: string, usage: RewriteUsage): void {
  if (process.env.NODE_ENV !== "production") return;
  console.log(JSON.stringify(buildRewriteMetrics(model, usage, Date.now())));
}
