import type { StreamChunk } from "@tanstack/ai";
import { isAbortError } from "#/lib/abort";

export interface TurnRecord {
  ts: string;
  threadId?: string;
  runId?: string;
  model: string;
  userChars: number;
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

export async function* withTurnLog(
  inner: AsyncIterable<StreamChunk>,
  partial: TurnRecord,
  startedAt: number,
): AsyncGenerator<StreamChunk> {
  let finishReason: string | undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let sawUsage = false;
  let error: string | undefined;
  let cancelled = false;

  try {
    for await (const chunk of inner) {
      if (chunk.type === "RUN_FINISHED") {
        finishReason = chunk.finishReason ?? finishReason;
        if (chunk.usage) {
          sawUsage = true;
          promptTokens += chunk.usage.promptTokens ?? 0;
          completionTokens += chunk.usage.completionTokens ?? 0;
          totalTokens += chunk.usage.totalTokens ?? 0;
        }
      }
      yield chunk;
    }
  } catch (err) {
    if (isAbortError(err)) {
      cancelled = true;
      return;
    }
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    logTurn({
      ...partial,
      durationMs: Date.now() - startedAt,
      finishReason,
      promptTokens: sawUsage ? promptTokens : undefined,
      completionTokens: sawUsage ? completionTokens : undefined,
      totalTokens: sawUsage ? totalTokens : undefined,
      cancelled: cancelled || undefined,
      error,
    });
  }
}
