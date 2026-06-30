import type { TrackingData } from "@govtech-bb/analytics";

// Delimiters for the paired `fieldErrors` property. Stripped from messages so
// the value can be split back into (field, message) entries reliably.
const ENTRY_SEP = " || ";
const PAIR_SEP = "::";

export function buildValidationErrorPayload(
  form: string,
  category: string,
  stepId: string,
  fieldResults: { fieldId: string; errors: string[] }[],
): TrackingData["form-validation-error"] {
  const failed = fieldResults.filter((r) => r.errors.length > 0);
  // Pair each field with each of its messages, so the report can show the
  // field id alongside the exact message it raised (not two separate lists).
  const fieldErrors = failed
    .flatMap((r) =>
      r.errors.map((message) => {
        const safe = message
          .split(ENTRY_SEP)
          .join(" / ")
          .split(PAIR_SEP)
          .join(":");
        return `${r.fieldId}${PAIR_SEP}${safe}`;
      }),
    )
    .join(ENTRY_SEP);
  return {
    form,
    category,
    step: stepId,
    errorCount: failed.length,
    fields: failed.map((r) => r.fieldId).join(","),
    errorTypes: failed.flatMap((r) => r.errors).join(","),
    fieldErrors,
  };
}
