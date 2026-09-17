import type { Primitive } from "@govtech-bb/form-types";
import { defaultValidationMessage } from "./default-messages";

/**
 * Why a resolved field's required-error message is unusable:
 *
 *  - `missing` — no `error` (or a blank one), so the applicant gets the
 *    runtime's generic fallback, or literally nothing.
 *  - `generic` — the message is the fallback, authored verbatim.
 */
export type RequiredMessageDefect = "missing" | "generic";

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
  if (error === undefined || error.trim() === "") return "missing";
  return error === defaultValidationMessage("required") ? "generic" : null;
}
