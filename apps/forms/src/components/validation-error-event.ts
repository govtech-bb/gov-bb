import type { TrackingData } from "@govtech-bb/analytics";

export function buildValidationErrorPayload(
  form: string,
  category: string,
  stepId: string,
  fieldResults: { fieldId: string; errors: string[] }[],
): TrackingData["form-validation-error"] {
  const failed = fieldResults.filter((r) => r.errors.length > 0);
  return {
    form,
    category,
    step: stepId,
    errorCount: failed.length,
    fields: failed.map((r) => r.fieldId).join(","),
    errorTypes: failed.flatMap((r) => r.errors).join(","),
  };
}
