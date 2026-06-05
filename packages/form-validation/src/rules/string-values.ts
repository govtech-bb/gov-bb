// Shared helpers for rules that validate a string value which may also arrive as
// an array of strings (multi-value text inputs). Used by the string-format rules
// and the phone rule.

export const str = (v: unknown): string =>
  typeof v === "string" ? v : String(v ?? "");

// Apply a single-string check to a value that may be an array of strings.
// Multi-value text inputs store an array; each non-empty element is validated
// independently and empty elements are skipped (a blank entry is "absent", not
// a rule violation). A non-array value is checked directly. Returns the first
// failing element's message, or null when every element passes.
//
// (Previously array values were coerced with `String(value)`, comma-joining
// them before the check — so e.g. `["ab","cd"]` against `maxLength: 3` became
// `"ab,cd"` and spuriously failed. That join was a bug.)
export const forEachString = (
  value: unknown,
  check: (element: unknown) => string | null,
): string | null => {
  if (Array.isArray(value)) {
    for (const element of value) {
      if (typeof element === "string" && element.length === 0) continue;
      const msg = check(element);
      if (msg !== null) return msg;
    }
    return null;
  }
  return check(value);
};
