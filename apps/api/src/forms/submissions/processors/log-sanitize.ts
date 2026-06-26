const MAX_LOGGED_LENGTH = 200;
const DEL = 0x7f;
const FIRST_PRINTABLE = 0x20;

/**
 * Sanitizes a value for safe interpolation into a log line. Strips control
 * characters — newlines, carriage returns, terminal escapes — that could
 * otherwise forge or break log entries (log injection, CWE-117), and bounds the
 * length so an oversized value cannot flood the logs.
 *
 * Use this for any user-influenced value (e.g. a submission's formId) before
 * including it in a log message.
 */
export function sanitizeForLog(value: unknown): string {
  const str = typeof value === "string" ? value : String(value);

  const cleaned = Array.from(str, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < FIRST_PRINTABLE || code === DEL ? " " : char;
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

  return `${value[0]}***@${domain}`;
}
