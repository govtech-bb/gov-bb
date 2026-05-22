import type { UIMessage } from "@tanstack/ai";
import { lastUserText, previousUserText } from "./messages";
import type { RetrievedContext, RetrieveResponse, Source } from "./types";

const SCORE_THRESHOLD = 0.55;
const MAX_SOURCES = 3;
const MAX_CONTEXT_CHARS = 6000;
const TOP_K = 8;
const GREETING_RE =
  /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening)|howdy)[!.\s]*$/i;

// Generic short follow-up patterns that have no topical content on their own
// ("how much?", "where do I go?", "what documents?"). For these we augment
// the retrieval query with the previous user message so the topic survives.
// Anything not matching is treated as topic-bearing and queried standalone.
const FOLLOWUP_RE =
  /^(how (much|long|do i|come)|where( do i)?|what (documents|do i|about|else|fee|cost|forms?)|when|why|who else|and (you|the)|more|tell me more|continue|.{0,12}\?)$/i;

export function isGreetingOrTooShort(line: string): boolean {
  return GREETING_RE.test(line) || line.length < 8;
}

function looksLikeFollowUp(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.split(/\s+/).length <= 3 && /\?$/.test(trimmed)) return true;
  return FOLLOWUP_RE.test(trimmed);
}

/**
 * Retrieval query. Defaults to ONLY the latest user message so a topic shift
 * ("MIST → register a birth") doesn't drag the prior turn's context into the
 * new search. Only augments with the previous user message when the latest
 * looks like a generic follow-up that wouldn't retrieve well on its own
 * ("how much?", "what documents?"). The assistant's text is never used as
 * retrieval signal — it would just amplify whatever was already retrieved.
 */
export function buildRetrievalQuery(messages: UIMessage[]): string {
  const last = lastUserText(messages);
  if (!looksLikeFollowUp(last)) return last;
  const prev = previousUserText(messages);
  return prev ? `${prev}\n${last}` : last;
}

export type RetrieveOk = { ok: true; data: RetrieveResponse };
export type RetrieveErr = { ok: false; status: number; reason: string };
export type RetrieveResult = RetrieveOk | RetrieveErr;

export async function retrieve(
  ragUrl: string,
  query: string,
  parentSignal: AbortSignal,
  timeoutMs = 4000,
): Promise<RetrieveResult> {
  const signal = AbortSignal.any([
    parentSignal,
    AbortSignal.timeout(timeoutMs),
  ]);

  try {
    const res = await fetch(`${ragUrl}/retrieve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK: TOP_K }),
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

export function filterSources(sources: Source[], query: string): Source[] {
  const lastLine = query.split("\n").pop()?.trim() ?? "";
  if (isGreetingOrTooShort(lastLine)) return [];

  const seen = new Set<string>();
  const filtered: Source[] = [];
  for (const s of sources) {
    if (s.score < SCORE_THRESHOLD) continue;
    const key = s.url + (s.section ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push({ ...s, url: withTextFragment(s.url, s.excerpt) });
    if (filtered.length >= MAX_SOURCES) break;
  }
  return filtered;
}

// Browser text fragments (#:~:text=) only highlight when the encoded string
// is an EXACT substring of the rendered page. Our chunks come with synthetic
// prefixes ("Title — Heading\n...") and markdown decorations that don't
// appear in the rendered DOM, so we strip those and quote a short literal
// sentence from the body.
function quotableSentence(raw: string): string {
  // Drop the "Title — Heading" prefix line if present.
  const afterPrefix = raw.includes("\n")
    ? raw.slice(raw.indexOf("\n") + 1)
    : raw;
  const stripped = afterPrefix
    .replace(/\*\*?([^*]+)\*\*?/g, "$1") // bold/italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/`([^`]+)`/g, "$1") // code spans
    .replace(/^\s*[-*]\s+/gm, "") // list bullets
    .replace(/^#+\s+/gm, "") // headings
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  // First sentence, capped to 100 chars — text-fragment match is more
  // reliable on short literal phrases than long ones.
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

export function onlyLegacySources(sources: Source[]): boolean {
  return sources.length > 0 && sources.every((s) => s.source === "legacy");
}

export function buildContextBlock(contexts: RetrievedContext[]): string {
  if (!contexts.length) return "(no relevant context found)";

  const seen = new Set<string>();
  const parts: string[] = [];
  let total = 0;
  let idx = 0;
  for (const c of contexts) {
    const key = `${c.title}::${c.section ?? ""}::${c.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    idx += 1;
    const head = c.section ? `${c.title} — ${c.section}` : c.title;
    const block = `[${idx}] ${head}\n${c.text}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join("\n\n---\n\n");
}
