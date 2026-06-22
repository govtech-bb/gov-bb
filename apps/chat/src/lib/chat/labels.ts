// Turn a fieldId slug into a human-readable label: separators to spaces,
// trimmed, first character capitalised. Used to display a form field when the
// contract carries no explicit label (check-your-answers rows, summary lines).
export function humanise(fieldId: string): string {
  const s = fieldId.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
