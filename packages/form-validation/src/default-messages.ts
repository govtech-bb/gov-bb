import type { ValidationConfig } from "@govtech-bb/form-types";

// Single source of truth for the default (author-unset) validation wording.
//
// The runtime rule runners consume this so the message a user sees and the
// message the analytics dashboard reconstructs for a `(fieldId, code)` pair are
// produced by the same code path — no drift. When a recipe author sets an
// explicit `error` string, that always wins and this is never consulted.
//
// `required` and the string rules (minLength/maxLength/pattern/email/contains)
// read from here directly (see rules/required.ts, rules/string.ts). Number,
// array, file and date rules still carry their own inline defaults; the entries
// for them below are the dashboard-side fallback wording used only when a
// recipe leaves those rules without an authored `error` (rare) — keep them in
// step with those runners if you touch them.
export function defaultValidationMessage(
  code: string,
  config?: Pick<ValidationConfig, "value">,
): string {
  const value = config?.value;
  switch (code) {
    case "required":
      return "This field is required";
    case "minLength":
      return `Must be at least ${value} characters`;
    case "maxLength":
      return `Must be at most ${value} characters`;
    case "pattern":
      return "Invalid format";
    case "email":
      return "Must be a valid email address";
    case "contains":
      return `Must contain "${value}"`;
    case "phone":
      return "Must be a valid phone number";
    case "min":
      return `Must be at least ${value}`;
    case "max":
      return `Must be at most ${value}`;
    case "minItems":
    case "minSelection":
      return `Select at least ${value}`;
    case "maxItems":
    case "maxSelection":
      return `Select at most ${value}`;
    // Synthetic date codes emitted by validateDateField (dates have no single
    // rule type for "the value entered isn't a real/complete date").
    case "invalid_date":
      return "Enter a valid date";
    case "incomplete_date":
      return "Enter a complete date";
    default:
      return "Invalid value";
  }
}
