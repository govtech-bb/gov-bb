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
// Digit threshold is 6+ (team decision): shorter numbers that appear in real
// form names — years (`cape exam registration 2024`), "under 11", etc. — stay
// readable, while every genuinely long identifier is still masked (NIS = 6,
// phone = 7+, TAMIS = 10-15, and the leading group of a national ID). Trade-off:
// a national ID's trailing 4-digit group (`850101-0001`) is not masked on its
// own; the birthdate part still is.
//
// Known limit: a free-text name ("john smith") has no digits and isn't masked —
// there's no reliable way to tell a name from a service term ("passport
// renewal") without NLP. The report only surfaces the most-frequent queries, so
// a one-off name never appears.

const MAX_QUERY_LENGTH = 60;

// Keep first + last char, asterisk the middle.
const maskToken = (token: string): string =>
  token.length > 3
    ? `${token[0]}${"*".repeat(token.length - 2)}${token[token.length - 1]}`
    : token;

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const LONG_NUMBER_RE = /\d{6,}/g;

/**
 * Redact PII from a search query before it is sent to analytics: emails and
 * runs of 6+ digits are partially masked; everything else is preserved. Also
 * trims, collapses internal whitespace, and caps length.
 */
export function maskSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(EMAIL_RE, maskToken) // emails first — they contain digits/letters
    .replace(LONG_NUMBER_RE, maskToken) // then bare long-number runs
    .slice(0, MAX_QUERY_LENGTH);
}
