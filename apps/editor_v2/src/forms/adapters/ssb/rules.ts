import type { Setting } from "../../core/settings";
import type { ValidationMessageKey } from "../../core/validation-messages";

export type RuleName = ValidationMessageKey;

export type Rule = { rule: RuleName; label: string; value?: Setting };

export type ErrorMessage = {
  rule: RuleName;
  label: string;
  message: string;
  default: string;
  pinned: boolean;
};

// SSB's packages/form-validation/src/required-message.ts: punctuation and case don't make a fieldless message useful.
const fieldless = new Set([
  "this field is required",
  "select an option",
  "select an answer",
  "select yes or no",
  "select at least one option",
]);

export function isFieldless(message: string) {
  const wording = message.trim().toLowerCase();
  let end = wording.length;

  while (end > 0 && (wording[end - 1] === "." || wording[end - 1] === "!")) end--;

  return fieldless.has(wording.slice(0, end));
}
