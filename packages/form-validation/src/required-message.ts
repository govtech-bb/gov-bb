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
 *  - `generic` — one of the field-less wordings, authored verbatim.
 */
export type RequiredMessageDefect = "missing" | "blank" | "generic";

/**
 * Compare on wording alone. Casing, surrounding space and a trailing period
 * change nothing for the applicant — the sentence still names no field — so
 * they must not buy a way past the gate.
 *
 * The trailing run is walked off by index rather than matched with `/[.!]+$/`:
 * that anchored-quantifier shape backtracks quadratically on a string of many
 * `!`, which CodeQL flags as js/polynomial-redos. The message reaching here is
 * recipe-authored, so it is not ours to trust with that.
 */
function wording(message: string): string {
  const normalised = message.trim().toLowerCase();
  let end = normalised.length;
  while (
    end > 0 &&
    (normalised[end - 1] === "." || normalised[end - 1] === "!")
  ) {
    end--;
  }
  return normalised.slice(0, end);
}

/**
 * Messages that identify no field: the runtime default, plus the stock phrases
 * authors reach for on a choice field (#2227). They fail the same way — two of
 * them on one step give the error summary two identical links, and the
 * applicant cannot tell which field is empty. A message that names what to
 * pick ("Select your parish") is fine.
 */
const FIELDLESS_WORDINGS = new Set(
  [
    defaultValidationMessage("required"),
    "Select an option",
    "Select an answer",
    "Select yes or no",
    "Select at least one option",
  ].map(wording),
);

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
 * An **unauthored** date is exempt: `validateDateField` never reaches the
 * required runner and composes its own label-aware `Enter ${label}`. That only
 * holds while nothing is authored — `validate-date.ts` reads
 * `requiredConfig?.error ?? \`Enter ${asPhrase(label)}\``, so an authored
 * message is shown verbatim on a date like anywhere else and is not exempt.
 */
export function requiredMessageDefect(
  field: Primitive,
): RequiredMessageDefect | null {
  const required = field.validations?.required;
  if (required === undefined || required.value === false) return null;

  // Typed `string | undefined`, but a custom component's definition reaches
  // here as `Record<string, unknown>` cast through `Primitive` with no
  // write-path validation, so the runtime value is not ours to trust.
  const error: unknown = required.error;

  // `config.error ?? default` treats null and undefined alike, so both fall
  // through to the generic default — and on a date, to the derived message.
  if (error === undefined || error === null) {
    return field.htmlType === "date" ? null : "missing";
  }
  // A non-string authored value cannot name the field either; flagging it as
  // `missing` keeps the gate from throwing on malformed input.
  if (typeof error !== "string") return "missing";
  if (error.trim() === "") return "blank";
  return FIELDLESS_WORDINGS.has(wording(error)) ? "generic" : null;
}

/**
 * Whether an authored message is one of the field-less wordings, for the
 * authoring surfaces (the Form Builder's editor warning) that hold a string
 * rather than a resolved field. Exported so the editor and the Deploy gate
 * cannot disagree about what counts as generic (#2715).
 */
export function isFieldlessRequiredWording(message: string): boolean {
  return FIELDLESS_WORDINGS.has(wording(message));
}
