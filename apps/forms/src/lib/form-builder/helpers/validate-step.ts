import type { AnyFormApi } from "@tanstack/react-form";
import type { ClientFormStep } from "@forms/types";

export interface ValidateStepResult {
  ok: boolean;
  results: any[][];
}

// Runs form.validateField for every field on the given step. `step` is an
// explicit parameter (not "the current step") so Phase 2's jump-walk can
// validate arbitrary intermediate steps too. Pure: no analytics, no
// scrolling, no DOM — callers own that.
export const validateStep = async (
  form: AnyFormApi,
  step: ClientFormStep,
): Promise<ValidateStepResult> => {
  const results = await Promise.all(
    step.fields.map((field) => form.validateField(field.id, "submit")),
  );
  return { ok: results.every((r) => r.length === 0), results };
};
