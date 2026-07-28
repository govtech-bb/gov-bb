// Citizen search queries are sent to a third-party analytics service (Umami).
// On a government-services search people type emails and identifiers (national
// ID / NIS / phone / TAMIS), so those must not leave verbatim (#2079). We keep
// the readable service words (so the "what are people searching" report still
// works) and mask only the structured PII we can reliably detect: emails and
// long numbers.
//
// Masking style (team decision, #2079): keep the first and last character and
// replace the middle with asterisks — e.g. `123456` → `1****6`. Chosen over a
// plain `#` so whoever reads the analytics can still tell something was redacted.
//
// A "number" here is a run of digit groups joined only by spaces or dashes, so a
// phone / ID typed with separators (`246-123-4567`, `1 246 123 4567`) is caught,
// not just a contiguous run (`1234567890`). The whole run is masked as one unit,
// so its middle digits and separators are hidden — only the first and last
// character survive.
//
// Digit threshold is 6+ total across the run (team decision): shorter numbers
// that appear in real form names — years (`cape exam registration 2024`),
// "under 11" — stay readable, while every genuinely long identifier is still
// masked (NIS = 6, phone = 7+, TAMIS = 10-15, national ID = 6+). A word between
// two groups breaks the run, so separate years (`cape exam 2024`) stay readable
// while a national ID (`850101-0001`) is masked end to end.
//
// Detection is deliberately non-backtracking: emails are found with a plain
// `includes("@")` per whitespace token, and numbers with the linear
// `\d+(?:[\s-]\d+)*` (each continuation needs a separator before more digits, so
// no group overlaps), so there is no ReDoS surface on untrusted query text.
//
// Known limit: a free-text name ("john smith") has no digits and isn't masked —
// there's no reliable way to tell a name from a service term ("passport
// renewal") without NLP. The report only surfaces the most-frequent queries, so
// a one-off name never appears.

const MAX_QUERY_LENGTH = 60;

// Total digits (across a separated run) at or above which a number is treated as
// an identifier and masked. Below this, form-name numbers (years) stay readable.
const MIN_MASKED_DIGITS = 6;

// A run of digit groups joined only by spaces or dashes: a phone / ID / NIS
// whether contiguous (`1234567890`) or separator-formatted (`246-123-4567`,
// `1 246 123 4567`). Linear / non-backtracking — see the note above.
const NUMERIC_RUN = /\d+(?:[\s-]\d+)*/g;

// Keep first + last char, asterisk the middle. A 1-2 char token has no middle,
// so it is returned unchanged.
function maskToken(token: string): string {
  if (token.length <= 2) return token;
  return `${token[0]}${"*".repeat(token.length - 2)}${token[token.length - 1]}`;
}

const digitCount = (s: string): number => s.replace(/\D/g, "").length;

/**
 * Redact PII from a search query before it is sent to analytics: any token
 * containing `@` (an email) is masked whole, and runs of 6+ digits — including
 * groups joined by spaces or dashes — are masked; everything else is preserved.
 * Also trims, collapses whitespace, and caps length.
 */
export function maskSearchQuery(raw: string): string {
  const collapsed = raw.trim().split(/\s+/).join(" ");
  return collapsed
    .split(" ")
    .map((word) => (word.includes("@") ? maskToken(word) : word))
    .join(" ")
    .replace(NUMERIC_RUN, (run) =>
      digitCount(run) >= MIN_MASKED_DIGITS ? maskToken(run) : run,
    )
    .slice(0, MAX_QUERY_LENGTH);
}
