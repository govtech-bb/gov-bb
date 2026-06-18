import {
  MAX_CONTEXT_CHARS,
  MAX_SOURCES,
  SCORE_THRESHOLD,
} from "#/lib/rag/config";
import type { Citation, RetrievedContext, Source } from "#/lib/rag/types";
import {
  newTokenizeState,
  tokenizeLinks,
  type LinkTokenMap,
} from "./link-tokens";
import { SYSTEM_PROMPT } from "./system-prompt";

// Turns retrieved chunks into the grounded context the model answers from:
// selects and trims sources to a character budget, tokenizes their links so the
// model can't mangle the URLs, and builds the per-turn system prompts. Also the
// cheap pre-checks that skip retrieval entirely — greetings, closers, and
// too-short messages with nothing to ground.

const GREETING_RE =
  /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening)|howdy)[!.\s]*$/i;

// Greetings and near-empty messages skip retrieval entirely — nothing to ground
// and embedding them wastes a round-trip.
export function isGreetingOrTooShort(line: string): boolean {
  return GREETING_RE.test(line.trim()) || line.trim().length < 2;
}

// Conversational-closer detection (ported from the old app): a user winding the
// chat down ("thanks, bye", "that's all") shouldn't trigger retrieval +
// abstention ("can't find that on alpha.gov.bb") — it should get a warm
// sign-off. Two tiers: UNAMBIGUOUS farewells/thanks/conclusions are always
// closers; AMBIGUOUS bare "no"/"ok" only when we just asked a wrap-up question.
const GRATITUDE =
  "(?:thanks|thank you|thank u|cheers|ty|much appreciated|appreciate it)";
const FAREWELL =
  "(?:bye|goodbye|good bye|see (?:ya|you)(?: later)?|take care|catch you later)";
const CONCLUSION =
  "(?:that'?s (?:all|it|everything|fine|enough)|that is (?:all|it|everything)|that'?ll be all|nothing else|no (?:thanks|thank you)|all (?:good|set|done)|i'?m (?:good|done|fine|all set)|we'?re (?:good|done)|done here)";
const FILLER_PREFIX =
  "(?:ok(?:ay)?|alright|right|great|perfect|cool|awesome|brilliant|lovely|excellent)";
const GRATITUDE_TAIL =
  "(?:so much|a lot|very much|again|for (?:your |the )?help|for helping)";
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
const WRAP_UP_RE = /anything else/i;

export function isConversationalCloser(
  latest: string,
  prevAssistantText: string,
): boolean {
  const t = latest.trim();
  if (!t || t.endsWith("?")) return false; // a question wants an answer
  const norm = t
    .toLowerCase()
    .replace(/[!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (UNAMBIGUOUS_CLOSER_RE.test(norm)) return true;
  if (AMBIGUOUS_CLOSER_RE.test(norm)) return WRAP_UP_RE.test(prevAssistantText);
  return false;
}

export interface CitedContext {
  block: string;
  citations: Citation[];
  linkTokens: LinkTokenMap;
}

const EMPTY_CONTEXT: CitedContext = {
  block: "(no relevant context found)",
  citations: [],
  linkTokens: {},
};

// Assemble retrieved chunks into a numbered, citable context block. Filters
// below SCORE_THRESHOLD, dedupes by url+section, caps at MAX_SOURCES and
// MAX_CONTEXT_CHARS. Chunk-text links are tokenised so the model can't emit a
// raw/fabricated URL. Citations carry text-fragment deep links for the client.
// Zero surviving sources → EMPTY_CONTEXT, the signal to abstain.
export function buildCitedContext(
  contexts: RetrievedContext[],
  sources: Source[],
  landingOrigin: string,
  includeFormIds = false,
): CitedContext {
  if (!contexts.length) return EMPTY_CONTEXT;

  const seen = new Set<string>();
  const blockParts: string[] = [];
  const citations: Citation[] = [];
  const tokenState = newTokenizeState();
  let total = 0;

  for (let i = 0; i < contexts.length && citations.length < MAX_SOURCES; i++) {
    const c = contexts[i];
    const s = sources[i];
    if (!s || s.score < SCORE_THRESHOLD) continue;
    const key = s.url + (s.section ?? "");
    if (seen.has(key)) continue;

    const head = c.section ? `${c.title} — ${c.section}` : c.title;
    const idx = citations.length + 1;
    // When collection is on, surface the exact formId so the model passes the
    // right id to getFormDefinition (not the service slug, which differs).
    const formTag = includeFormIds && s.formId ? ` [form: ${s.formId}]` : "";
    // The model sees NO raw URLs: links in the chunk text become opaque tokens
    // (restored client-side), and the citation's real URL stays out of the
    // block (the client annotates [N] markers).
    const text = tokenizeLinks(c.text, tokenState, landingOrigin);
    const block = `[${idx}] ${head}${formTag}\n${text}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;

    seen.add(key);
    blockParts.push(block);
    total += block.length;
    citations.push({
      number: String(idx),
      url: withTextFragment(s.url, s.excerpt),
      title: c.title,
      section: c.section,
    });
  }

  if (!citations.length) return EMPTY_CONTEXT;
  return {
    block: blockParts.join("\n\n---\n\n"),
    citations,
    linkTokens: tokenState.map,
  };
}

const GROUNDING_INSTRUCTION = `Answer using ONLY the numbered sources below. Cite each fact with its [N] marker (e.g. "you need two photos [1]"). If the sources don't cover the question, say you don't have that information rather than guessing. Never write a raw URL — refer to sources only by their [N] marker.

Sources:`;

const ABSTAIN_INSTRUCTION = `You have no relevant official sources for this question. Tell the user you can't find that on alpha.gov.bb, and suggest they rephrase or browse the site. Do not guess or answer from outside knowledge.`;

// Compose the per-turn system prompts: base persona + either the grounded
// context (with citing rules) or the abstention instruction.
export function buildSystemPrompts(ctx: CitedContext): string[] {
  if (!ctx.citations.length) return [SYSTEM_PROMPT, ABSTAIN_INSTRUCTION];
  return [SYSTEM_PROMPT, `${GROUNDING_INSTRUCTION}\n\n${ctx.block}`];
}

// text-fragment links (#:~:text=) need an exact substring of the rendered page,
// so strip the synthetic "Title — Heading" prefix and markdown markers.
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
  return (match ? match[0] : stripped.slice(0, 100)).trim();
}

function withTextFragment(url: string, excerpt?: string): string {
  if (!excerpt || url === "#") return url;
  const clean = quotableSentence(excerpt);
  if (!clean) return url;
  return `${url}#:~:text=${encodeURIComponent(clean)}`;
}
