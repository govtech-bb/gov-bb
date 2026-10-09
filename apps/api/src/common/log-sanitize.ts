const MAX_LOGGED_LENGTH = 200;
const FIRST_PRINTABLE = 0x20;

/**
 * Characters that can forge or disguise a log line: C0 controls (newlines,
 * terminal escapes), DEL and the C1 controls, plus Unicode format characters
 * some log viewers render as line breaks or reversed text: the line and
 * paragraph separators and the bidi marks, embeddings, overrides and isolates
 * (#2971).
 */
function isLogUnsafe(code: number): boolean {
  return (
    code < FIRST_PRINTABLE ||
    (code >= 0x7f && code <= 0x9f) || // DEL + C1 controls
    code === 0x200e || // left-to-right mark
    code === 0x200f || // right-to-left mark
    code === 0x2028 || // line separator
    code === 0x2029 || // paragraph separator
    (code >= 0x202a && code <= 0x202e) || // bidi embeddings and overrides
    (code >= 0x2066 && code <= 0x2069) // bidi isolates
  );
}

/**
 * Sanitizes a value for safe interpolation into a log line. Replaces control
 * and Unicode format characters — newlines, terminal escapes, line separators,
 * bidi overrides (see isLogUnsafe) — that could otherwise forge or disguise log
 * entries (log injection, CWE-117), and bounds the length so an oversized value
 * cannot flood the logs.
 *
 * Use this for any user-influenced value (e.g. a submission's formId) before
 * including it in a log message.
 */
export function sanitizeForLog(value: unknown): string {
  const str = typeof value === "string" ? value : String(value);

  const cleaned = Array.from(str, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return isLogUnsafe(code) ? " " : char;
  })
    .join("")
    .trim();

  return cleaned.length > MAX_LOGGED_LENGTH
    ? `${cleaned.slice(0, MAX_LOGGED_LENGTH)}…`
    : cleaned;
}

const REDACTED = "[hidden]";

/**
 * Masks a value known to be personal data before it is written to a log line.
 *
 * An email is reduced to its first character plus its domain
 * (`jane@gmail.com` → `j***@gmail.com`) — enough for an operator to recognise an
 * address during support/debugging without recording it in full. The masked
 * middle is always a fixed `***`, so the local-part length doesn't leak either.
 *
 * Any other value — a name, a phone number, or a malformed/empty address that
 * can't be partially masked safely — is fully redacted to `[hidden]`.
 *
 * Logs are more widely accessible and longer retained than the submissions
 * database, so personal data must never be written there in the clear
 * (issue #1640). The caller decides what is PII; use the submission ID (already
 * safe) for correlation and look the real value up in the database when a
 * support/debugging case genuinely needs it.
 */
export function redactPii(value: unknown): string {
  if (typeof value !== "string") return REDACTED;

  // An email needs a non-empty local part and a non-empty domain. `at <= 0`
  // covers both "no @ at all" (indexOf → -1) and an empty local part ("@x").
  const at = value.indexOf("@");
  if (at <= 0) return REDACTED;

  const domain = value.slice(at + 1);
  if (!domain) return REDACTED;

  // The local part is masked, but the domain is caller-supplied (the citizen's
  // submitted address), so the masked result is still run through
  // sanitizeForLog — stripping control characters (log injection, CWE-117) and
  // bounding length, exactly as every other user-influenced log value is.
  return sanitizeForLog(`${value[0]}***@${domain}`);
}

// An email-shaped run: no whitespace, brackets, quotes or list separators on
// either side of the "@", so "…check: jane@x.com, bob@y.org" yields two.
const EMAIL_IN_TEXT = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+/g;

/**
 * Makes free text — typically a delivery error message — safe to log when it
 * may name a person's email address: every email-shaped substring is masked
 * with {@link redactPii}, then the whole text goes through
 * {@link sanitizeForLog}. Use it where the text comes from a third party (an
 * SES rejection can name the address it rejected), not just for a value you
 * already know is an email (#2971).
 */
export function redactEmailsIn(text: unknown): string {
  const str = typeof text === "string" ? text : String(text);
  return sanitizeForLog(str.replace(EMAIL_IN_TEXT, (m) => redactPii(m)));
}
