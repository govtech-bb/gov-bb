// Minimal structured logger. Prod: one JSON line per record (CloudWatch Logs
// Insights parses JSON directly). Dev: a readable single line. Secrets/PII are
// redacted before emit. Mirrors openstory's logger *pattern* (JSON lines +
// redaction) without the LogTape dependency — fits our nitro/AWS stack.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const REDACT = "[REDACTED]";

// Redact obvious secrets before anything reaches a log sink. Ported from
// openstory's SECRET_PATTERNS — credential-prefixed tokens, connection strings
// with embedded creds, long base64 blobs, AWS access-key ids, and 40-char
// values near a key/token/secret keyword.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|fal|key|token|secret|password|bearer)[-_]?[A-Za-z0-9\-_.]{16,}\b/gi,
  /\b(?:postgres|postgresql|mysql|redis|https?):\/\/[^\s"']+@[^\s"']+/gi,
  /\b[A-Za-z0-9+/]{64,}={0,2}\b/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\b[A-Za-z0-9_-]{40}\b(?=.*(?:token|key|secret))/gi,
];

export function redactString(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) out = out.replace(re, REDACT);
  return out;
}

const isProd = (): boolean => process.env.NODE_ENV === "production";

// Redact the fully-serialised line, not per-field — so a secret nested inside a
// structured field value (e.g. `{ err: { message: "postgres://…" } }`) is
// caught too, not just top-level strings.
function emit(level: Level, event: string, fields: Fields = {}): void {
  if (isProd()) {
    const line = JSON.stringify({
      level,
      ts: new Date().toISOString(),
      event,
      ...fields,
    });
    console.log(redactString(line));
  } else {
    const extras = Object.keys(fields).length
      ? ` ${JSON.stringify(fields)}`
      : "";
    console.log(redactString(`[${level}] ${event}${extras}`));
  }
}

export const logger = {
  debug: (event: string, fields?: Fields) => emit("debug", event, fields),
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
