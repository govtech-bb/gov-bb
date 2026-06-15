// The ONE definition of "required" for the chat, mirroring the shared
// @govtech-bb/form-validation engine: the rule counts only when it is
// PRESENT and its value !== false. Recipes make a field optional two ways —
// removing the rule entirely (the middle-name fields) or keeping it with
// `required: { value: false }` (the address-line-2 fields). Truthiness
// checks (`!!validations?.required`) treat the second as required: the
// schema disclosure said "(required)" and the Skip button never rendered,
// while validation would happily accept a blank. Client-safe: no server
// imports, usable from ask-field.tsx.
export function isRequiredField(
  validations?: Record<string, unknown> | null,
): boolean {
  const required = validations?.required;
  if (required === undefined || required === null) return false;
  return (required as { value?: unknown }).value !== false;
}
