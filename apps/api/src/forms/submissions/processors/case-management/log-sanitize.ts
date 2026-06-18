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
