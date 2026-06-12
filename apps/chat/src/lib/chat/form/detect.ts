import { getFormIndex, type FormIndexEntry } from "./defs";
import { QUERY_STOP, tokenize } from "./tokenize";

// 2 overlapping meaningful tokens (e.g. "post" + "office") is enough signal
// to call it a match after stopwords are stripped.
const MIN_SCORE = 2;
// How far below the top score a form can sit and still count as a plausible
// alternative. A near-tie (within 1 point) means the user's wording names
// several forms about equally well — "redirect mail" overlaps the personal /
// individual / deceased variants — so we DISAMBIGUATE rather than guess. A
// clear winner (every rival more than this below the top) still pins outright.
const AMBIGUITY_MARGIN = 1;
// Cap on how many candidates we surface as disambiguation choices, mirroring
// the RAG path's topServiceCandidates cap so the choice list stays scannable.
const MAX_CANDIDATES = 3;

// Pure ranking core — no network. Scores every index form by how many of the
// user's meaningful tokens overlap its title tokens, keeps those clearing
// MIN_SCORE, and returns the within-margin set in deterministic order (score
// desc, then shorter formId, then formId lexical). The first element is the
// single best match (same winner-take-all the matcher always produced); two or
// more elements means the request is ambiguous.
export function matchFormCandidatesFromIndex(
  userText: string,
  index: FormIndexEntry[],
  opts: { margin?: number; max?: number } = {},
): FormIndexEntry[] {
  const { margin = AMBIGUITY_MARGIN, max = MAX_CANDIDATES } = opts;
  if (!userText) return [];
  const textToks = tokenize(userText, QUERY_STOP);
  if (!textToks.size) return [];

  const scored: Array<{ entry: FormIndexEntry; score: number }> = [];
  for (const entry of index) {
    let score = 0;
    for (const t of textToks) if (entry.titleToks.has(t)) score++;
    if (score >= MIN_SCORE) scored.push({ entry, score });
  }
  if (!scored.length) return [];

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.entry.formId.length - b.entry.formId.length ||
      (a.entry.formId < b.entry.formId ? -1 : 1),
  );

  const topScore = scored[0].score;
  return scored
    .filter((s) => s.score >= topScore - margin)
    .slice(0, max)
    .map((s) => s.entry);
}

// The forms the user's recent text plausibly names, best first. One element →
// an unambiguous match; two or more → a genuine ambiguity the caller should
// disambiguate instead of pinning.
export async function matchFormCandidates(
  userText: string,
): Promise<FormIndexEntry[]> {
  const index = await getFormIndex();
  if (!index.length) return [];
  return matchFormCandidatesFromIndex(userText, index);
}

// Single best match (or null) — the winner-take-all convenience used where a
// caller only needs to know "did the topic switch to some form", not whether
// the choice was ambiguous (feedback-switch release, handoff defer).
export async function matchFormsFromText(
  userText: string,
): Promise<FormIndexEntry | null> {
  return (await matchFormCandidates(userText))[0] ?? null;
}
