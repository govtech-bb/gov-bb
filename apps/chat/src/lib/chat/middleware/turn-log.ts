import type { ChatMiddleware } from "@tanstack/ai";
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

// Emits one structured [turn] record per chat() run via the middleware
// lifecycle. Tokens accumulate in onUsage because FinishInfo.usage only
// carries the LAST agent-loop iteration. durationMs runs from `startedAt`
// (not the engine's info.duration) so it includes the rewrite + retrieval
// work done before chat() was invoked. The engine surfaces an external abort
// (client Stop / disconnect) as an AbortError through onError — onAbort only
// fires for middleware-initiated aborts — so both paths mark the record
// cancelled. Exactly one terminal hook fires per run.
export function turnLogMiddleware(
  partial: TurnRecord,
  startedAt: number,
): ChatMiddleware {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let sawUsage = false;

  const finish = (rest: Partial<TurnRecord>) => {
    logTurn({
      ...partial,
      durationMs: Date.now() - startedAt,
      promptTokens: sawUsage ? promptTokens : undefined,
      completionTokens: sawUsage ? completionTokens : undefined,
      totalTokens: sawUsage ? totalTokens : undefined,
      ...rest,
    });
  };

  return {
    name: "turn-log",
    onUsage: (_ctx, usage) => {
      sawUsage = true;
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      totalTokens += usage.totalTokens;
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
