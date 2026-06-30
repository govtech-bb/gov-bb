// Custom-component rows feed straight into the AI system prompt that every
// edit/convert action reuses, so they are treated as untrusted input on read
// (#292). There is no write-path validation today — rows only land via direct
// DB access — so we make the interpolated fields structurally inert and bounded
// here rather than ruling on whether `custom_components` is "trusted".

// Just the fields the prompt line interpolates — structurally compatible with
// the `CustomComponent` entity, so callers pass the DB rows directly.
interface CustomComponentLike {
  namespace: string;
  type: string;
  definition: Record<string, unknown>;
}

const MAX_FIELD_LENGTH = 80;

// Collapse whitespace runs (kills newlines), strip backticks and angle brackets
// (neutralizes `</system>`-style markers and fenced-block escapes), trim, then
// clamp. Non-strings collapse to "" so the caller's fallback takes over.
export function sanitizeField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/[`<>]/g, "")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

// Render the "## Live Custom Components" lines from the live rows. Output is
// byte-identical to the legacy inline map for clean rows; the format is owned by
// buildSystemPrompt (heading + base prompt) — this just sanitizes and joins.
export function formatCustomComponentList(
  components: CustomComponentLike[],
): string {
  return components
    .map((c) => {
      const ns = sanitizeField(c.namespace);
      const type = sanitizeField(c.type);
      const htmlType = sanitizeField(c.definition?.htmlType) || "unknown";
      const label = sanitizeField(c.definition?.label) || "no label";
      return `- \`components/${ns}/${type}\` — ${htmlType} (${label})`;
    })
    .join("\n");
}
