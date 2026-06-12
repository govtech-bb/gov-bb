import type { ChatMiddleware } from "@tanstack/ai";
import { isAbortError } from "#/lib/abort";
import { emitTurnMetrics } from "./turn-metrics";

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
  // ADR 0048 stage-4 observability: the code-chosen turn action and the
  // funnel phase the session ended the turn in. With `retrieved` (candidates
  // + scores) these are the raw rows for calibrating the routing decision
  // table from production traffic.
  action?: string;
  phase?: string;
  // The named run-turn branch this turn took (#1271) — the chartable status
  // taxonomy (see turn-status.ts). Computed in run-turn, deterministic.
  status?: string;
  // How many citations this turn's context block carried.
  citationCount?: number;
  // A grounded answer turn (status "answered", citations supplied) whose
  // final text contains no [N] marker (#1271): the known wrong-service leak
  // shape — the model answered confidently without grounding in what was
  // retrieved. Observability first; regenerate-or-abstain can follow once
  // the production rate is known.
  ungroundedAnswer?: boolean;
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

function logTurn(rec: TurnRecord): void {
  console.log(`[turn] ${JSON.stringify(rec)}`);
}

const CITATION_MARKER_RE = /\[\d+\]/;

// Pure so the flag logic is unit-testable: only a grounded ANSWER turn can be
// ungrounded — statuses that legitimately answer without [N] markers
// (handoff templates, closers, offers) never flag.
export function isUngroundedAnswer(
  status: string | undefined,
  citationCount: number | undefined,
  text: string,
): boolean {
  if (status !== "answered") return false;
  if (!citationCount) return false;
  if (!text.trim()) return false;
  return !CITATION_MARKER_RE.test(text);
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
  let answerText = "";
  const toolCalls: { tool: string; ok: boolean; ms: number }[] = [];

  const finish = (rest: Partial<TurnRecord>) => {
    const rec: TurnRecord = {
      ...partial,
      durationMs: Date.now() - startedAt,
      promptTokens: sawUsage ? promptTokens : undefined,
      completionTokens: sawUsage ? completionTokens : undefined,
      totalTokens: sawUsage ? totalTokens : undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      cancelled: aborted || undefined,
      error: runError,
      ungroundedAnswer:
        isUngroundedAnswer(partial.status, partial.citationCount, answerText) ||
        undefined,
      ...rest,
    };
    logTurn(rec);
    emitTurnMetrics(rec);
  };

  return {
    name: "turn-log",
    onChunk: (_ctx, chunk) => {
      if (chunk.type === "RUN_ERROR") {
        if (chunk.code === "aborted") aborted = true;
        else runError = chunk.message;
      }
      // Accumulate the assistant's text for the grounding check. Marker-only
      // scan at finish — the text itself is never logged (PII discipline).
      if (chunk.type === "TEXT_MESSAGE_CONTENT" && "delta" in chunk) {
        answerText += String(chunk.delta ?? "");
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
