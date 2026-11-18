/** Existing required-message wording, shared by fields that ask people to choose. */
export function selectionRequiredMessage(given: string, fallback: string) {
  const label = given.trim() || fallback;

  if (label.endsWith("?")) return `Answer “${label}”`;

  const phrase = (label.replace(/[?:]$/, "").trim() || fallback).replace(
    /^[A-Z][a-z]/,
    (start) => start[0]!.toLowerCase() + start[1],
  );

  const message = `Select ${phrase}`;

  const plain = message
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");

  return [
    "this field is required",
    "select an option",
    "select an answer",
    "select yes or no",
    "select at least one option",
  ].includes(plain)
    ? `Answer “${label}”`
    : message;
}
