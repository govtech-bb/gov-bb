import type { Primitive } from "@govtech-bb/form-types";
import { defaultValidationMessage } from "./default-messages";

/**
 * Why a resolved field's required-error message is unusable:
 *
 *  - `missing` — no `error` at all, so `requiredRunner` falls back and the
 *    applicant reads the generic default, which names no field.
 *  - `blank` — an `error` of only whitespace. `requiredRunner` reads
 *    `config.error ?? defaultValidationMessage("required")`, and `??` treats
 *    `""` as authored, so no fallback happens: the submission is still
 *    blocked, but the applicant is shown an error with no text at all.
 *  - `generic` — the default's wording, authored verbatim.
 */
export type RequiredMessageDefect = "missing" | "blank" | "generic";

/**
 * Compare on wording alone. Casing, surrounding space and a trailing period
 * change nothing for the applicant — the sentence still names no field — so
 * they must not buy a way past the gate.
 */
function wording(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
}

/**
 * Whether a **resolved** field (registry base merged with its recipe
 * overrides) would show the applicant a required-error message that names no
 * field, or `null` when it is fine.
 *
 * The forms error summary uses each message as its link text, so two such
 * fields on one step produce two identical links and the applicant cannot tell
 * which one is empty (#2227). This is the shared definition behind both gates
 * — `pnpm validate-recipes` on the trunk and the Form Builder's Deploy gate —
 * so neither can drift from the other or from the runtime default.
 *
 * Date fields are exempt: `validateDateField` never reaches the required
 * runner and composes its own label-aware `Enter ${label}`.
 */
export function requiredMessageDefect(
  field: Primitive,
): RequiredMessageDefect | null {
  if (field.htmlType === "date") return null;

  const required = field.validations?.required;
  if (required === undefined || required.value === false) return null;

  const error = required.error;
  if (error === undefined) return "missing";
  if (error.trim() === "") return "blank";
  return wording(error) === wording(defaultValidationMessage("required"))
    ? "generic"
    : null;
}
