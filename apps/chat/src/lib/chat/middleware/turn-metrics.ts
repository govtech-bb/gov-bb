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
