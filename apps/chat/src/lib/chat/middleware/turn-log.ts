import type { ChatMiddleware } from "@tanstack/ai";
import { logger } from "#/lib/observability/logger";
import { emitTurnMetrics } from "./turn-metrics";

// Per-turn telemetry. One structured `chat.turn` record per `chat()` run,
// emitted through the structured logger (JSON line + redaction in prod) and, in
// prod, as a CloudWatch EMF metric line (see turn-metrics).
//
// PII discipline: log the user message LENGTH always, but the message TEXT only
// in dev (the caller gates `query`). Tokens accumulate in onUsage. Exactly one
// terminal hook fires per run: onFinish (normal), onAbort (cancel/timeout), or
// onError (an unhandled throw) — all three route to `finish`, so every turn
// produces exactly one record. The Bedrock adapter also yields a RUN_ERROR
// chunk on failure, caught in onChunk to enrich that record. Observability hooks
// only — onAfterToolCall records outcomes but never gates; no onBeforeToolCall
// (rate limits / gating live at the WAF/HTTP edge).

export interface TurnMeta {
  threadId?: string;
  runId?: string;
  model: string;
  userChars: number;
  /** Which capability set served the turn — "rag" (strict question-answering) or "assist" (in-chat forms enabled). */
  mode?: string;
  /** Retrieval was attempted but failed, so the turn ran on thin/no context. */
  retrieveDegraded?: boolean;
  /** Dev-only; never set in prod (PII). */
  query?: string;
}

export interface TurnRecord extends TurnMeta {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  finishReason?: string;
  cancelled?: boolean;
  error?: string;
  toolFailures?: number;
}

// Default sink: the structured log line (level + ts stamped, secrets redacted)
// plus the EMF metric line for CloudWatch. Tests inject their own sink and so
// bypass both.
const defaultSink = (rec: TurnRecord) => {
  logger.info("chat.turn", { ...rec });
  emitTurnMetrics(rec);
};

export function turnLogMiddleware(
  meta: TurnMeta,
  startedAt: number,
  sink: (rec: TurnRecord) => void = defaultSink,
): ChatMiddleware {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let sawUsage = false;
  let runError: string | undefined;
  let cancelled = false;
  let toolFailures = 0;
  let done = false;

  const finish = (rest: Partial<TurnRecord>) => {
    if (done) return; // one record per run, whichever terminal hook fires first
    done = true;
    sink({
      ...meta,
      durationMs: Date.now() - startedAt,
      promptTokens: sawUsage ? promptTokens : undefined,
      completionTokens: sawUsage ? completionTokens : undefined,
      totalTokens: sawUsage ? totalTokens : undefined,
      cancelled: cancelled || undefined,
      error: runError,
      toolFailures: toolFailures || undefined,
      ...rest,
    });
  };

  return {
    name: "turn-log",
    onChunk: (_ctx, chunk) => {
      if (chunk.type === "RUN_ERROR") {
        const c = chunk as { code?: string; message?: string };
        if (c.code === "aborted") cancelled = true;
        else runError = c.message ?? "unknown error";
      }
    },
    onUsage: (_ctx, usage) => {
      sawUsage = true;
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      totalTokens += usage.totalTokens;
    },
    onAfterToolCall: (_ctx, info) => {
      if (!info.ok) toolFailures += 1;
    },
    onFinish: (_ctx, info) => {
      finish({ finishReason: info.finishReason ?? undefined });
    },
    // The engine routes a cancelled run (client disconnect, or our stream
    // timeout calling abortController.abort()) to onAbort — NOT onError — and
    // exactly one terminal hook fires per run. Without this, a timed-out turn
    // would be logged nowhere, which is exactly the turn you most want recorded.
    onAbort: (_ctx, info) => {
      finish({ cancelled: true, durationMs: info.duration });
    },
    onError: (_ctx, info) => {
      const err = info.error;
      if (err instanceof Error && err.name === "AbortError") {
        finish({ cancelled: true });
        return;
      }
      finish({ error: err instanceof Error ? err.message : String(err) });
    },
  };
}
