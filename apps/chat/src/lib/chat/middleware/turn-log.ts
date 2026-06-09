import type { ChatMiddleware } from "@tanstack/ai";
import { isAbortError } from "#/lib/abort";

export interface TurnRecord {
  ts: string;
  threadId?: string;
  runId?: string;
  model: string;
  userChars: number;
  // Omitted on collection turns — those messages are field answers (PII).
  query?: string;
  retrieved: { id: string; score: number; kind?: string }[];
  formSlug?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  finishReason?: string;
  retrieveDegraded?: boolean;
  cancelled?: boolean;
  error?: string;
  // Names only, never args (PII).
  toolCalls?: { tool: string; ok: boolean; ms: number }[];
}

export function toEmf(rec: TurnRecord): Record<string, unknown> {
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
    ...(rec.durationMs !== undefined && {
      "ChatTurn.LatencyMs": rec.durationMs,
    }),
    ...(rec.promptTokens !== undefined && {
      "ChatTurn.LlmInputTokens": rec.promptTokens,
    }),
    ...(rec.completionTokens !== undefined && {
      "ChatTurn.LlmOutputTokens": rec.completionTokens,
    }),
    "ChatTurn.RetrievalDegraded": rec.retrieveDegraded ? 1 : 0,
    // Non-metric fields kept for CloudWatch Logs Insights searchability:
    ts: rec.ts,
    threadId: rec.threadId,
    runId: rec.runId,
    model: rec.model,
    userChars: rec.userChars,
    query: rec.query,
    formSlug: rec.formSlug,
    finishReason: rec.finishReason,
    cancelled: rec.cancelled,
    error: rec.error,
    retrieved: rec.retrieved,
    toolCalls: rec.toolCalls,
  };
}

function logTurn(rec: TurnRecord): void {
  console.log(JSON.stringify(toEmf(rec)));
}

// One [turn] record per chat() run. Tokens accumulate in onUsage —
// FinishInfo.usage only carries the last agent-loop iteration. durationMs
// runs from `startedAt` so the rewrite + retrieval work before chat() is
// included. The Bedrock adapter yields RUN_ERROR chunks instead of throwing,
// and the engine then ends the run via onFinish — so failures must be caught
// in onChunk or they'd log as normal finishes; onError/onAbort cover paths
// that do throw.
export function turnLogMiddleware(
  partial: TurnRecord,
  startedAt: number,
): ChatMiddleware {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let sawUsage = false;
  let runError: string | undefined;
  let aborted = false;
  const toolCalls: { tool: string; ok: boolean; ms: number }[] = [];

  const finish = (rest: Partial<TurnRecord>) => {
    logTurn({
      ...partial,
      durationMs: Date.now() - startedAt,
      promptTokens: sawUsage ? promptTokens : undefined,
      completionTokens: sawUsage ? completionTokens : undefined,
      totalTokens: sawUsage ? totalTokens : undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      cancelled: aborted || undefined,
      error: runError,
      ...rest,
    });
  };

  return {
    name: "turn-log",
    onChunk: (_ctx, chunk) => {
      if (chunk.type === "RUN_ERROR") {
        if (chunk.code === "aborted") aborted = true;
        else runError = chunk.message;
      }
    },
    onUsage: (_ctx, usage) => {
      sawUsage = true;
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      totalTokens += usage.totalTokens;
    },
    onAfterToolCall: (_ctx, info) => {
      toolCalls.push({
        tool: info.toolName,
        ok: info.ok,
        ms: Math.round(info.duration),
      });
    },
    onFinish: (_ctx, info) => {
      finish({ finishReason: info.finishReason ?? undefined });
    },
    onAbort: () => {
      finish({ cancelled: true });
    },
    onError: (_ctx, info) => {
      if (isAbortError(info.error)) {
        finish({ cancelled: true });
        return;
      }
      finish({
        error:
          info.error instanceof Error ? info.error.message : String(info.error),
      });
    },
  };
}
