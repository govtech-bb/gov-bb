import type { AnyFieldApi, AnyFormApi } from "@tanstack/react-form";
import type { ClientFormStep, FormMeta } from "@forms/types";
import { buildFieldValidationProperties } from "../validation-builder";

export interface ValidateStepResult {
  ok: boolean;
  results: any[][];
}

// Runs form.validateField for every field on the given step. `step` is an
// explicit parameter (not "the current step") so Phase 2's jump-walk can
// validate arbitrary intermediate steps too. Pure: no analytics, no
// scrolling, no DOM — callers own that.
//
// `formMeta`, when passed, switches to a FALLBACK validation path for steps
// that are not the currently-mounted step. TanStack's `form.validateField`
// is a no-op for a field with no live `<form.Field>` instance — it neither
// runs that field's own validator nor reflects its current value's real
// validity (see jump-walk.spike.spec.tsx for the empirical proof). The
// fallback resolves each field's validator exactly as form-renderer.tsx's
// `resolveValidators` does (a pre-built entry in `formMeta.validationProperties`,
// falling back to `buildFieldValidationProperties`) and runs its `onDynamic`
// check directly against the live form values, independent of mount state.
// Omit `formMeta` for the currently-mounted step so that path — the one
// `handleContinue` already relies on — is unchanged.
export const validateStep = async (
  form: AnyFormApi,
  step: ClientFormStep,
  formMeta?: FormMeta,
): Promise<ValidateStepResult> => {
  if (formMeta) {
    const results = step.fields.map((field) => {
      const validators =
        formMeta.validationProperties[field.id] ??
        buildFieldValidationProperties(field);
      const value = form.getFieldValue(field.id);
      return (
        validators.onDynamic?.({
          value,
          fieldApi: { form } as unknown as AnyFieldApi,
        }) ?? []
      );
    });
    return { ok: results.every((r) => r.length === 0), results };
  }

  const results = await Promise.all(
    step.fields.map((field) => form.validateField(field.id, "submit")),
  );
  return { ok: results.every((r) => r.length === 0), results };
};
