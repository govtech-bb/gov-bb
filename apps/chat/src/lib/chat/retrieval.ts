import {
  MAX_CONTEXT_CHARS,
  MAX_SOURCES,
  SCORE_THRESHOLD,
  TOP_K,
} from "#/lib/rag/config";
import type {
  Citation,
  RetrievedContext,
  RetrieveResponse,
  Source,
} from "./types";

const GREETING_RE =
  /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening)|howdy)[!.\s]*$/i;

export function isGreetingOrTooShort(line: string): boolean {
  return GREETING_RE.test(line) || line.length < 2;
}

// Conversational closer detection (#1125). A user winding the chat down ("thanks,
// bye", "no that's all") and a genuine retrieval miss BOTH produce zero
// citations, so run-turn can't tell them apart by citation count. This
// content-based check lets a closer route to a warm sign-off + feedback
// invitation instead of the misapplied "guide toward the closest service" miss
// path. Two tiers, because some replies are only closers in context:
//
// - UNAMBIGUOUS — farewells / thanks / "that's all" sign-offs. A closer
//   regardless of what we just said: these can't be a mid-task answer.
// - AMBIGUOUS — bare "no" / "ok" / "nope". A closer ONLY when our previous
//   message asked the "anything else?" wrap-up question, so a terse "no"
//   answering a real question mid-conversation isn't mistaken for a goodbye.

// Composable fragments, combined below. Kept as named parts (cf. messages.ts's
// TOOL_CALL_BODY) so the closer regex stays readable.
const GRATITUDE = "(?:thank you|thanks|thankyou|thx|ty|cheers|ta)";
const FAREWELL =
  "(?:bye|goodbye|good bye|see (?:ya|you)(?: later)?|take care|catch you later)";
const CONCLUSION =
  "(?:that'?s (?:all|it|everything|fine|enough)|that is (?:all|it|everything)|that'?ll be all|nothing else|no (?:thanks|thank you)|all (?:good|set|done)|i'?m (?:good|done|fine|all set)|we'?re (?:good|done)|done here)";
const FILLER_PREFIX =
  "(?:ok(?:ay)?|alright|right|great|perfect|cool|awesome|brilliant|lovely|excellent)";
const GRATITUDE_TAIL =
  "(?:so much|a lot|very much|again|for (?:your |the )?help|for helping)";

// Whole-message match: an optional upbeat prefix ("ok", "great"), one core
// closer phrase, then any number of trailing closer fragments. Anchored, so
// "thanks, where's the office?" (a real question riding on "thanks") is NOT a
// closer — "where's the office" can't be consumed by the trailing group.
const UNAMBIGUOUS_CLOSER_RE = new RegExp(
  "^(?:" +
    FILLER_PREFIX +
    "[\\s,]+)?(?:" +
    GRATITUDE +
    "(?:[\\s,]+" +
    GRATITUDE_TAIL +
    ")?|" +
    FAREWELL +
    "|" +
    CONCLUSION +
    ")(?:[\\s,]+(?:" +
    GRATITUDE +
    "|" +
    FAREWELL +
    "|" +
    GRATITUDE_TAIL +
    "|then|now))*[\\s,]*$",
  "i",
);

const AMBIGUOUS_CLOSER_RE =
  /^(?:no|nope|nah|not really|ok(?:ay)?|sure|alright|fine|cool|great|i'?m good|im good|all good|that'?s (?:ok|fine)|no that'?s (?:all|it|fine))[\s,]*$/i;

// We asked the wrap-up question last turn. The phrasing is fixed by WRAP_UP
// guidance in the prompt so this stays in lockstep with what the model emits.
const WRAP_UP_RE = /anything else/i;

export function isConversationalCloser(
  latest: string,
  prevAssistantText: string,
): boolean {
  const t = latest.trim();
  // A question is never a closer (it wants an answer, not a sign-off). Normalise
  // sentence punctuation to spaces so "thanks!!" / "that's all." still match.
  if (!t || t.endsWith("?")) return false;
  const norm = t
    .toLowerCase()
    .replace(/[!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (UNAMBIGUOUS_CLOSER_RE.test(norm)) return true;
  if (AMBIGUOUS_CLOSER_RE.test(norm)) return WRAP_UP_RE.test(prevAssistantText);
  return false;
}

// Service document ids are minted as `service-<slug>` by the ingest chunker.
const SERVICE_ID_PREFIX = "service-";

// Derive a form slug from the single top-ranked retrieved source, used by
// run-turn to drive a form handoff from RAG when the title-token matcher didn't
// pin a form. Semantic retrieval finds the right service even when the user's
// wording doesn't overlap the form title (e.g. "how do I become a conductor"),
// so if that service maps to a published form that must be completed in the
// forms app, we hand over the link instead of a plain informational answer.
//
// Conservative on purpose: only the top source is considered (it represents the
// turn's actual topic — we don't reach past it to a lower-ranked form), it must
// clear the same score bar as a citation pill, and a non-service or
// below-threshold top suppresses the fallback. run-turn decides what to do with
// the slug — a fresh handoff, or a continuation reminder if it's the form the
// user was already handed off to.
export function topHandoffCandidateSlug(sources: Source[]): string | null {
  const top = sources[0];
  if (!top || top.score < SCORE_THRESHOLD) return null;
  if (!top.id.startsWith(SERVICE_ID_PREFIX)) return null;
  const slug = top.id.slice(SERVICE_ID_PREFIX.length);
  if (!slug) return null;
  return slug;
}

export type RagFallbackDecision =
  | { action: "none" }
  | { action: "fresh-handoff" }
  | { action: "continuation" };

// Decide what the RAG fallback should do with the top retrieved service, given
// whether it resolves to a handoff-required form and whether it's the form the
// user was already handed off to. Split out as a pure function so the branching
// is unit-testable without the network (getFormSlugs / resolveActiveForm).
//
// `candidate` is null when the matcher already pinned a form, the session is
// mid-collection, or no eligible top service was retrieved (run-turn folds
// those gates into computing it), so a null candidate means "do nothing".
export function decideRagFallback(params: {
  candidate: string | null;
  candidateHandoff: boolean;
  handedOffSlug: string | null;
}): RagFallbackDecision {
  const { candidate, candidateHandoff, handedOffSlug } = params;
  if (!candidate || !candidateHandoff) return { action: "none" };
  // Same form the user was already handed off to → they're following up; keep
  // helping informationally with the link, don't re-issue the strict handoff.
  return candidate === handedOffSlug
    ? { action: "continuation" }
    : { action: "fresh-handoff" };
}

export type RetrieveResult =
  | { ok: true; data: RetrieveResponse }
  | { ok: false; status: number; reason: string };

export async function retrieve(
  ragUrl: string,
  query: string,
  parentSignal: AbortSignal,
  options: { boostSlug?: string; timeoutMs?: number } = {},
): Promise<RetrieveResult> {
  const { boostSlug, timeoutMs = 4000 } = options;
  const signal = AbortSignal.any([
    parentSignal,
    AbortSignal.timeout(timeoutMs),
  ]);

  try {
    const res = await fetch(`${ragUrl}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK: TOP_K, boostSlug }),
      signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        reason: `Retrieve failed ${res.status}`,
      };
    }
    return { ok: true, data: (await res.json()) as RetrieveResponse };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    if (aborted) return { ok: true, data: { contexts: [], sources: [] } };
    return { ok: false, status: 502, reason: "Retrieve failed" };
  }
}

export interface CitedContext {
  block: string;
  citations: Citation[];
}

export function buildCitedContext(
  contexts: RetrievedContext[],
  sources: Source[],
  query: string,
): CitedContext {
  const lastLine = query.split("\n").pop()?.trim() ?? "";
  if (isGreetingOrTooShort(lastLine) || !contexts.length) {
    return { block: "(no relevant context found)", citations: [] };
  }

  const seen = new Set<string>();
  const blockParts: string[] = [];
  const citations: Citation[] = [];
  let total = 0;

  for (let i = 0; i < contexts.length && citations.length < MAX_SOURCES; i++) {
    const c = contexts[i];
    const s = sources[i];
    if (!s || s.score < SCORE_THRESHOLD) continue;
    const key = s.url + (s.section ?? "");
    if (seen.has(key)) continue;
    const head = c.section ? `${c.title} — ${c.section}` : c.title;
    const idx = citations.length + 1;
    const linkUrl = withTextFragment(s.url, s.excerpt);
    const block = `[${idx}] ${head}\nURL: ${linkUrl}\n${c.text}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    seen.add(key);
    blockParts.push(block);
    total += block.length;
    citations.push({
      number: String(idx),
      url: linkUrl,
      title: c.title,
      section: c.section,
    });
  }

  if (!citations.length) {
    return { block: "(no relevant context found)", citations: [] };
  }
  return { block: blockParts.join("\n\n---\n\n"), citations };
}

// text-fragment links (#:~:text=) require an exact substring of the rendered
// page, so strip the synthetic "Title — Heading" prefix and markdown markers.
function quotableSentence(raw: string): string {
  const afterPrefix = raw.includes("\n")
    ? raw.slice(raw.indexOf("\n") + 1)
    : raw;
  const stripped = afterPrefix
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  const match = stripped.match(/^[^.!?\n]{8,100}[.!?]?/);
  const candidate = match ? match[0] : stripped.slice(0, 100);
  return candidate.trim();
}

function withTextFragment(url: string, excerpt?: string): string {
  if (!excerpt || url === "#") return url;
  const clean = quotableSentence(excerpt);
  if (!clean) return url;
  return `${url}#:~:text=${encodeURIComponent(clean)}`;
}
