import type { TurnRecord } from "./turn-log";

// CloudWatch Embedded Metric Format (#1049). A single JSON log line that
// CloudWatch Logs auto-extracts into metrics — no SDK, no agent config.
// Dimensioned by Model only: low cardinality, and per-model cost/latency is
// the split that matters when the Bedrock model changes.
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
    ToolFailures: rec.toolCalls?.filter((t) => !t.ok).length ?? 0,
  };
}

export function emitTurnMetrics(rec: TurnRecord): void {
  // EMF lines are only useful in CloudWatch; skip the noise in local dev.
  if (import.meta.env.DEV) return;
  console.log(JSON.stringify(buildTurnMetrics(rec, Date.now())));
}
