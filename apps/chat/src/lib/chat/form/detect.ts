import { getFormIndex, type FormIndexEntry } from "./defs";
import { familyMembers } from "./policy";
import { QUERY_STOP, tokenize } from "./tokenize";

// 2 overlapping meaningful tokens (e.g. "post" + "office") is enough signal
// to call it a match after stopwords are stripped.
const MIN_SCORE = 2;
// How far below the top score a form can sit and still count as a plausible
// alternative. A near-tie (within 1 point) means the user's wording names
// several forms about equally well, so we DISAMBIGUATE rather than guess. A
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
//
// FAMILY EXPANSION (#1296): when the lexical winner belongs to a declared
// service family, the candidate set becomes the whole family (winner first, then
// declaration order) — provided 2+ members are in the index. This is what makes
// a broad "redirect mail" offer all three post-office-redirection variants even
// though their published titles DON'T share tokens ("Post Office Redirection -
// Business" scores 0 on "redirect mail", so token overlap alone surfaces only
// the individual form). The family is the robust signal the titles can't give.
export function matchFormCandidatesFromIndex(
  userText: string,
  index: FormIndexEntry[],
  opts: {
    margin?: number;
    max?: number;
    familyOf?: (formId: string) => ReadonlySet<string> | null;
  } = {},
): FormIndexEntry[] {
  const {
    margin = AMBIGUITY_MARGIN,
    max = MAX_CANDIDATES,
    familyOf = familyMembers,
  } = opts;
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
  const ranked = scored
    .filter((s) => s.score >= topScore - margin)
    .map((s) => s.entry);

  // Family expansion: the winner names a service with audience variants. Offer
  // the whole family (winner first, then declaration order), so the user picks
  // the variant instead of being silently pinned to the one that happened to
  // share tokens. Gated on 2+ family members actually present in the (already
  // surfaceable-filtered) index — a family with a single live member pins as
  // normal. Replaces the lexical set: the family IS the answer to a family hit.
  const winner = ranked[0];
  const family = familyOf(winner.formId);
  if (family) {
    const present = [...family].filter((id) =>
      index.some((e) => e.formId === id),
    );
    if (present.length >= 2) {
      const ordered = [
        winner.formId,
        ...present.filter((id) => id !== winner.formId),
      ];
      return ordered
        .map((id) => index.find((e) => e.formId === id))
        .filter((e): e is FormIndexEntry => e !== undefined)
        .slice(0, max);
    }
  }

  return ranked.slice(0, max);
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
