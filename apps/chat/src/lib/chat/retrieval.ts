import {
  MAX_CONTEXT_CHARS,
  MAX_SOURCES,
  SCORE_THRESHOLD,
  TOP_K,
} from "./rag-config";
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
    // Colon separator (not an em dash) so we don't prime the model with the
    // very character the system prompt forbids in output (prompts.ts).
    const head = c.section ? `${c.title}: ${c.section}` : c.title;
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
