import type { ValidationConfig, ValidationRule } from "@govtech-bb/form-types";
import { isFieldlessRequiredWording } from "@govtech-bb/form-builder";

// Re-exported so the editor surfaces test the wording through one import.
export { isFieldlessRequiredWording };

// The message the runtime falls back to when `required.error` is unset, and
// the message every `components/generic-*` primitive but `generic-tel` ships
// (mirrors `defaultValidationMessage("required")` in
// packages/form-validation/src/default-messages.ts). It names no field, and
// the forms error summary uses the message verbatim as its link text — so a
// page of blank required fields produces a list of identical links (#2710).
export const GENERIC_REQUIRED_MSG = "This field is required";

// The house pattern for a required message the author hasn't written
// themselves. Also the shape the registry's own messages take ("Last name is
// required"), which is what lets a rename track through an inherited one.
export function deriveRequiredMessage(label: string): string {
  return `${label.trim()} is required`;
}

/**
 * The message the applicant actually sees.
 *
 * Not a key-by-key fallback: `shallowMergeDefined` merges `validations` at the
 * *rule* level, so once the field declares a `required` rule of its own the
 * base's whole object — message included — is out of the picture. A bare
 * `{ value: true }` over a base that ships "Email address is required"
 * therefore resolves to the generic sentinel, not to the base's message.
 */
export function effectiveRequiredMessage(
  validations: ValidationRule | undefined,
  baseValidations: ValidationRule | undefined,
): string {
  const rule =
    validations?.required !== undefined
      ? validations.required
      : baseValidations?.required;
  return rule?.error ?? GENERIC_REQUIRED_MSG;
}

function isDerivedOrGeneric(
  message: string,
  label: string | undefined,
): boolean {
  if (isFieldlessRequiredWording(message)) return true;
  return label !== undefined && message === deriveRequiredMessage(label);
}

function isEffectivelyRequired(
  validations: ValidationRule | undefined,
  defaultRequired: boolean,
): boolean {
  return validations?.required !== undefined
    ? validations.required.value !== false
    : defaultRequired;
}

interface RequiredRuleOnTickArgs {
  validations: ValidationRule | undefined;
  baseValidations: ValidationRule | undefined;
  defaultRequired: boolean;
  // The applicant-visible label: the override if set, else the base primitive's.
  label: string | undefined;
}

/**
 * The `required` override to write when the Required checkbox is ticked, or
 * `undefined` to drop the key and inherit.
 *
 * The bug this fixes: writing a bare `{ value: true }` *replaced* the base's
 * whole `required` object (validations merge shallow at the rule level via
 * `shallowMergeDefined`), so ticking a box labelled "Required" on an
 * already-required field silently destroyed the message the registry shipped —
 * 9 live recipes are in that state.
 */
export function requiredRuleOnTick({
  validations,
  baseValidations,
  defaultRequired,
  label,
}: RequiredRuleOnTickArgs): ValidationConfig | undefined {
  const authored = validations?.required?.error;
  if (authored !== undefined && !isFieldlessRequiredWording(authored)) {
    return { value: true, error: authored };
  }

  const inherited = baseValidations?.required?.error;
  const inheritedIsUsable =
    inherited !== undefined && !isFieldlessRequiredWording(inherited);

  // The base already requires the field and says something useful — inherit it
  // rather than persisting a copy that would go stale if the registry changed.
  if (defaultRequired && inheritedIsUsable) return undefined;

  if (inheritedIsUsable) return { value: true, error: inherited };

  const derived = label?.trim() ? deriveRequiredMessage(label) : undefined;
  // Both keys together: a bare `{ error }` would drop `value` in the merge.
  return derived ? { value: true, error: derived } : { value: true };
}

interface SyncRequiredMessageArgs {
  validations: ValidationRule | undefined;
  baseValidations: ValidationRule | undefined;
  defaultRequired: boolean;
  // Effective labels (override ?? base) either side of the edit.
  previousLabel: string | undefined;
  nextLabel: string | undefined;
}

/**
 * Keeps the required message naming the field as the label is edited, and
 * returns `validations` untouched when it must not.
 *
 * Only a message that reads as auto-derived is rewritten: absent, the generic
 * sentinel, or exactly `"{previous label} is required"` — which also catches an
 * inherited registry message written in the same shape (`components/email`'s
 * "Email address is required" against the label "Email address"). Anything
 * else is copy someone wrote on purpose and is left alone. Comparing against
 * the previous label rather than tracking an "is this auto?" flag keeps the
 * decision stateless, so it survives the panel closing and reopening.
 */
export function syncRequiredMessageToLabel({
  validations,
  baseValidations,
  defaultRequired,
  previousLabel,
  nextLabel,
}: SyncRequiredMessageArgs): ValidationRule | undefined {
  if (!isEffectivelyRequired(validations, defaultRequired)) return validations;
  if (!nextLabel?.trim()) return validations;

  const current = effectiveRequiredMessage(validations, baseValidations);
  if (!isDerivedOrGeneric(current, previousLabel)) return validations;

  return {
    ...validations,
    required: { value: true, error: deriveRequiredMessage(nextLabel) },
  };
}
