const HEADING_RE = /^\*\*[^*\n]+\*\*$/;
const LIST_ITEM_RE = /^(?:[-*+]\s|\d+\.\s)/;
const MAX_BULLET_LENGTH = 240;

export function normalizeMarkdown(raw: string): string {
  if (!raw) return raw;

  // Deterministic backstop for the system prompt's "no em/en dashes, anywhere,
  // ever" rule (prompts.ts) — the model still emits them, so strip at render.
  // Use [ \t] (not \s) around the em dash so adjacent newlines are preserved
  // and lines aren't merged. En dashes collapse to a plain hyphen so ranges
  // ("9–5" → "9-5") stay tight.
  const dashed = raw.replace(/[ \t]*—[ \t]*/g, " - ").replace(/–/g, "-");

  const lines = dashed.split("\n");
  const out: string[] = [];
  let inSection = false;
  let prevWasBlank = false;

  for (const original of lines) {
    const line = original.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (!trimmed) {
      if (prevWasBlank) inSection = false;
      prevWasBlank = true;
      out.push("");
      continue;
    }

    if (HEADING_RE.test(trimmed)) {
      inSection = true;
      prevWasBlank = false;
      if (out.length > 0 && out.at(-1) !== "") out.push("");
      out.push(trimmed);
      out.push("");
      continue;
    }

    if (LIST_ITEM_RE.test(trimmed)) {
      out.push(trimmed);
      prevWasBlank = false;
      continue;
    }

    if (trimmed.endsWith("?")) {
      inSection = false;
      prevWasBlank = false;
      if (out.length > 0 && out.at(-1) !== "") out.push("");
      out.push(trimmed);
      continue;
    }

    const lastOut = out.at(-1) ?? "";
    const stillInList =
      inSection && (HEADING_RE.test(lastOut) || LIST_ITEM_RE.test(lastOut));

    if (stillInList && trimmed.length <= MAX_BULLET_LENGTH) {
      out.push(`- ${trimmed}`);
      prevWasBlank = false;
      continue;
    }

    inSection = false;
    prevWasBlank = false;
    out.push(line);
  }

  return out.join("\n");
}
