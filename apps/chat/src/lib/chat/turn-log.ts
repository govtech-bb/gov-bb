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

export function logTurn(rec: TurnRecord): void {
  console.log(`[turn] ${JSON.stringify(rec)}`);
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
        const c = chunk as unknown as {
          finishReason?: string;
          usage?: {
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
          };
        };
        finishReason = c.finishReason ?? finishReason;
        if (c.usage) {
          sawUsage = true;
          promptTokens += c.usage.promptTokens ?? 0;
          completionTokens += c.usage.completionTokens ?? 0;
          totalTokens += c.usage.totalTokens ?? 0;
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
