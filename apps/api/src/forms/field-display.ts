import type { Primitive } from "@govtech-bb/form-types";

// Option-based field types whose stored value is a slug that maps to a
// human-readable label (via `options` / `groups`). Every other field type
// (text, date, file, number, …) stores its value directly.
const OPTION_HTML_TYPES = new Set([
  "radio",
  "select",
  "checkbox",
  "checkbox-accordion",
]);

/** True when `field` stores option value-slugs that resolve to display labels. */
export function isOptionField(field: Primitive): boolean {
  return OPTION_HTML_TYPES.has(field.htmlType);
}

function labelOf(
  options: ReadonlyArray<{ label: string; value: string }> | undefined,
  value: unknown,
): string {
  return (
    options?.find((o) => o.value === String(value))?.label ?? String(value)
  );
}

/**
 * Resolve an option field's raw submission value to its display label(s):
 *  - `radio` / single `select` → the label string;
 *  - multi `select` / `checkbox` / `checkbox-accordion` → an array of labels.
 * An unmatched value falls back to the raw value (stringified). A non-option
 * field returns its raw value unchanged — callers format those themselves.
 *
 * Single source of truth for value→label so the CMS webhook payload (#842) and
 * the MDA notification email render the same labels.
 */
export function resolveOptionDisplay(field: Primitive, raw: unknown): unknown {
  switch (field.htmlType) {
    case "radio":
      return labelOf(field.options, raw);

    case "select":
      return field.multiple && Array.isArray(raw)
        ? raw.map((v) => labelOf(field.options, v))
        : labelOf(field.options, raw);

    case "checkbox":
      return (Array.isArray(raw) ? raw : [raw]).map((v) =>
        labelOf(field.options, v),
      );

    case "checkbox-accordion": {
      // Value is a flat string[] across all categories; resolve against the
      // groups' options flattened into one list.
      const opts = (field.groups ?? []).flatMap((g) => g.options);
      return (Array.isArray(raw) ? raw : [raw]).map((v) => labelOf(opts, v));
    }

    default:
      return raw;
  }
}
