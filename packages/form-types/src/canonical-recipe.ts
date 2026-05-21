/**
 * Serializes a value to the canonical on-disk form used by the recipes/ tree:
 * object keys sorted alphabetically at every level (arrays preserve their
 * order), pretty-printed with 2-space indent, with a trailing newline. Used by
 * the export script, the lint:recipes CI check, and the builder publish flow,
 * so PR diffs stay reviewable and git history stays stable.
 */
export function canonicalizeRecipe(value: unknown): string {
  return JSON.stringify(value, sortKeysReplacer, 2) + "\n";
}

function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}
