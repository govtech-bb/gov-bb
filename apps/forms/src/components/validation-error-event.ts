import type { TrackingData } from "@govtech-bb/analytics";

// Encode the per-field failure reasons as a single collision-proof string:
//   "postcode:pattern;parish:required;id-number:required|pattern"
// `;` separates fields, `:` separates a field from its codes, `|` separates
// multiple codes on one field. Field ids are kebab-case and codes come from a
// closed enum, so none of them can contain these delimiters — unlike the old
// comma-joined message strings, which split apart on any comma in the wording.
export function buildValidationErrorPayload(
  form: string,
  category: string,
  stepId: string,
  fieldResults: { fieldId: string; codes: string[] }[],
): TrackingData["form-validation-error"] {
  const failed = fieldResults.filter((r) => r.codes.length > 0);
  return {
    form,
    category,
    step: stepId,
    errorCount: failed.length,
    fieldErrors: failed
      .map((r) => `${r.fieldId}:${r.codes.join("|")}`)
      .join(";"),
  };
}
