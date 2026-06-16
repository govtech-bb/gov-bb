import { SCORE_THRESHOLD } from "#/lib/rag/config";
import type { Handoff, Source } from "#/lib/rag/types";
import { isSurfaceableForm } from "./policy";

// Pick a "Start now" handoff from retrieved sources: the highest-scoring source
// (sources arrive score-desc) that clears the citation threshold, is a
// chat-approved form, and has a start page. The link is METADATA-derived —
// `<service url>/start` — so no forms API or tool call is needed (the landing
// app resolves the start route from the page's formId; chat just deep-links to
// it). Returns null when nothing qualifies. Gated by `features.forms` upstream.
export function selectHandoff(
  sources: Source[],
  minScore = SCORE_THRESHOLD,
): Handoff | null {
  for (const s of sources) {
    // Sorted desc — once below the threshold, nothing later qualifies either.
    if (s.score < minScore) break;
    if (!s.formId || !s.hasStartPage || !isSurfaceableForm(s.formId)) continue;
    return {
      formId: s.formId,
      title: s.title,
      startUrl: `${s.url.replace(/\/+$/, "")}/start`,
    };
  }
  return null;
}
