import type { ChatMiddleware } from "@tanstack/ai";
import { isAbortError } from "#/lib/abort";

export interface TurnRecord {
  ts: string;
  threadId?: string;
  runId?: string;
  model: string;
  userChars: number;
  // Truncated user query for correlating phrasing → tool calls. Omitted on
  // active-collection turns, where the "query" is a field answer (PII).
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
  // Per-tool outcomes (name/ok/duration) — names only, never args (PII).
  toolCalls?: { tool: string; ok: boolean; ms: number }[];
}

export function logTurn(rec: TurnRecord): void {
  console.log(`[turn] ${JSON.stringify(rec)}`);
}

// Emits one structured [turn] record per chat() run via the middleware
// lifecycle. Tokens accumulate in onUsage because FinishInfo.usage only
// carries the LAST agent-loop iteration. durationMs runs from `startedAt`
// (not the engine's info.duration) so it includes the rewrite + retrieval
// work done before chat() was invoked. Exactly one terminal hook fires per
// run.
//
// The Bedrock adapter never throws from chatStream — every failure (and an
// external abort) is yielded as a RUN_ERROR chunk, after which the engine
// ends the run via onFinish (or onAbort when the signal is aborted). Without
// the onChunk tap a model failure would log as a normal-looking finish, so
// RUN_ERROR is captured there: code "aborted" marks the record cancelled,
// anything else lands in `error`. onError/onAbort stay as the safety net for
// adapters or engine paths that do throw.
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
