/**
 * Shared validation pattern for person-name fields (first / middle / last /
 * full name). Single source of truth so the four name components can't drift
 * apart (#1843).
 *
 * Unicode-aware: `\p{L}` accepts letters from any script (Latin incl. Polish/
 * Czech/Vietnamese/Turkish, plus Cyrillic, Arabic, CJK, …) and `\p{M}` accepts
 * combining marks. Interior separators allowed: spaces, hyphen, the straight
 * (`'`) and typographic (`’`, U+2019 — auto-inserted by iOS/macOS/Word)
 * apostrophes, and periods (for initials like "J. R."). A name must start with a
 * letter and end on a letter, combining mark, or period — so `St. John`,
 * `O’Brien`, `J. R.`, and a decomposed (NFD) `Lê` all pass, while a dangling
 * `Smith-` or trailing space does not. The trailing `\p{M}` matters for NFD text
 * (iOS/macOS), where an accented final letter is base-letter + combining-mark and
 * would otherwise be rejected as a non-letter ending.
 *
 * Requires the `u` (Unicode) flag — the validation runner (`patternRunner` in
 * @govtech-bb/form-validation) compiles pattern rules with it. Stored as a
 * string because component definitions are serialisable data, not code.
 *
 * NOTE: pattern only. A single-character name (e.g. `李`) still fails the
 * separate `minLength: 2` rule on these components — a known, intentional
 * limitation of #1843, not changed here.
 */
export const PERSON_NAME_PATTERN =
  "^\\s*\\p{L}(?:[\\p{L}\\p{M}\\s'’.-]*[\\p{L}\\p{M}.])?\\s*$";

/**
 * Human-readable list of what a person-name may contain, for the pattern rule's
 * error message. Kept beside the pattern so the two stay consistent.
 */
export const PERSON_NAME_ALLOWED =
  "letters, spaces, hyphens, apostrophes, or periods";
