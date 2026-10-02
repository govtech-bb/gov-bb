import { JSX } from "react";
import { ClientPrimitive } from "@forms/types";

/**
 * The muted "(optional)" appended inside a field's label/legend. Required
 * fields carry no mark (GOV.UK convention — never asterisks).
 *
 * Mirrors the validator's required check (form-validation/validate-field.ts):
 * a rule that is absent or explicitly `value: false` is optional; a bare rule
 * or `value: true` is required. Derived from the static resolved contract on
 * purpose — conditionally-optional fields (optionalIf) are statically
 * required, so they never carry the mark and label text never rewrites itself
 * while the user toggles the answer that relaxes them.
 */
export function optionalSuffix(field: ClientPrimitive): JSX.Element | null {
  const rule = field.validations?.required;
  const isRequired =
    rule !== undefined && (rule.value === undefined || rule.value !== false);
  if (isRequired) return null;
  return (
    <>
      {" "}
      <span className="govbb-label__optional">(optional)</span>
    </>
  );
}
