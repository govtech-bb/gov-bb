import { getFormIndex, type FormIndexEntry } from "./defs";

const STOP = new Set([
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

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

// 2 overlapping meaningful tokens (e.g. "post" + "office") is enough signal
// to call it a match after stopwords are stripped.
const MIN_SCORE = 2;

export async function matchFormsFromText(
  userText: string,
): Promise<FormIndexEntry | null> {
  if (!userText) return null;
  const index = await getFormIndex();
  if (!index.length) return null;
  const textToks = tokens(userText);
  if (!textToks.size) return null;

  let best: { entry: FormIndexEntry; score: number } | null = null;
  for (const entry of index) {
    let score = 0;
    for (const t of textToks) if (entry.titleToks.has(t)) score++;
    if (score < MIN_SCORE) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && entry.formId.length < best.entry.formId.length)
    ) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}
