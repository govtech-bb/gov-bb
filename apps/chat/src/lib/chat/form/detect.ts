import { getFormIndex, type FormIndexEntry } from "./defs";
import { QUERY_STOP, tokenize } from "./tokenize";

// 2 overlapping meaningful tokens (e.g. "post" + "office") is enough signal
// to call it a match after stopwords are stripped.
const MIN_SCORE = 2;

export async function matchFormsFromText(
  userText: string,
): Promise<FormIndexEntry | null> {
  if (!userText) return null;
  const index = await getFormIndex();
  if (!index.length) return null;
  const textToks = tokenize(userText, QUERY_STOP);
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
