// Stopwords shared by form-title tokenization (defs.ts) and user-message
// tokenization (detect.ts). The query side adds conversational filler that
// never appears in titles but is common in user messages.
export const TITLE_STOP: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
  "and",
  "or",
  "form",
  "application",
  "apply",
  "register",
  "registration",
  "online",
  "service",
]);

export const QUERY_STOP: ReadonlySet<string> = new Set([
  ...TITLE_STOP,
  "do",
  "i",
  "want",
  "need",
  "get",
  "this",
  "that",
  "my",
  "please",
]);

export function tokenize(s: string, stop: ReadonlySet<string>): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length > 2 && !stop.has(t)),
  );
}
