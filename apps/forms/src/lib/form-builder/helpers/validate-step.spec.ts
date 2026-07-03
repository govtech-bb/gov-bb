/**
 * validate-step.spec.ts
 *
 * Unit tests for the pure step-validation helper extracted from
 * handleContinue (#1864 phase 1): runs form.validateField for every field
 * in a given step and reports a pass/fail summary. No analytics, no
 * scrolling, no DOM — those stay with the caller.
 */

import { validateStep } from "./validate-step";
import type { ClientFormStep, ClientPrimitive } from "@forms/types";

function makeField(fieldId: string, stepId: string): ClientPrimitive {
  return {
    id: `${stepId}_${fieldId}`,
    fieldId,
    stepId,
    name: fieldId,
    label: fieldId,
    htmlType: "text",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
  };
}

function makeStep(stepId: string, fieldIds: string[] = []): ClientFormStep {
  return {
    stepId,
    title: `Step ${stepId}`,
    fields: fieldIds.map((fid) => makeField(fid, stepId)),
  };
}

function makeForm(validateField: (fieldId: string) => string[]) {
  return { validateField: vi.fn(validateField) } as any;
}

describe("validateStep", () => {
  it("returns ok:true and one empty result per field when every field passes", async () => {
    const step = makeStep("step-1", ["name", "email"]);
    const form = makeForm(() => []);

    const result = await validateStep(form, step);

    expect(result).toEqual({ ok: true, results: [[], []] });
  });

  it("returns ok:false when any field's result is non-empty", async () => {
    const step = makeStep("step-1", ["name", "email"]);
    const form = makeForm((fieldId) =>
      fieldId === "step-1_name" ? ["This field is required"] : [],
    );

    const result = await validateStep(form, step);

    expect(result.ok).toBe(false);
    expect(result.results).toEqual([["This field is required"], []]);
  });

  it("calls form.validateField with each field's id and 'submit' as the cause", async () => {
    const step = makeStep("step-1", ["name", "email"]);
    const form = makeForm(() => []);

    await validateStep(form, step);

    expect(form.validateField).toHaveBeenCalledWith("step-1_name", "submit");
    expect(form.validateField).toHaveBeenCalledWith("step-1_email", "submit");
    expect(form.validateField).toHaveBeenCalledTimes(2);
  });

  it("orders results exactly as step.fields, regardless of field id order", async () => {
    const step = makeStep("step-1", ["b", "a", "c"]);
    const calledWith: string[] = [];
    const form = makeForm((fieldId) => {
      calledWith.push(fieldId);
      return [];
    });

    await validateStep(form, step);

    expect(calledWith).toEqual(["step-1_b", "step-1_a", "step-1_c"]);
  });

  it("returns ok:true with an empty results array for a step with no fields", async () => {
    const step = makeStep("step-1", []);
    const form = makeForm(() => []);

    const result = await validateStep(form, step);

    expect(result).toEqual({ ok: true, results: [] });
  });

  // Phase 2 (#1864): the jump-walk needs to validate steps that are NOT the
  // currently-mounted step. form.validateField is a no-op for an unmounted
  // field (see jump-walk.spike.spec.tsx), so passing `formMeta` switches to a
  // fallback that resolves each field's validator the same way
  // form-renderer.tsx's `resolveValidators` does and runs it directly against
  // the live form values via `form.getFieldValue` — never touching
  // `form.validateField`.
  describe("formMeta fallback (unmounted steps)", () => {
    it("resolves validators from formMeta.validationProperties and runs them against getFieldValue, without calling form.validateField", async () => {
      const step = makeStep("step-1", ["name"]);
      const onDynamic = vi.fn(({ value }: { value: unknown }) =>
        value ? undefined : ["Required"],
      );
      const formMeta = {
        validationProperties: { "step-1_name": { onDynamic } },
      } as any;
      const form = {
        validateField: vi.fn(),
        getFieldValue: vi.fn(() => ""),
      } as any;

      const result = await validateStep(form, step, formMeta);

      expect(result).toEqual({ ok: false, results: [["Required"]] });
      expect(onDynamic).toHaveBeenCalledWith(
        expect.objectContaining({ value: "" }),
      );
      expect(form.getFieldValue).toHaveBeenCalledWith("step-1_name");
      expect(form.validateField).not.toHaveBeenCalled();
    });

    it("falls back to buildFieldValidationProperties when formMeta has no entry for the field", async () => {
      // makeField sets no `validations`, so buildFieldValidationProperties
      // returns a passthrough (always-valid) validator for it.
      const step = makeStep("step-1", ["name"]);
      const formMeta = { validationProperties: {} } as any;
      const form = {
        validateField: vi.fn(),
        getFieldValue: vi.fn(() => ""),
      } as any;

      const result = await validateStep(form, step, formMeta);

      expect(result).toEqual({ ok: true, results: [[]] });
      expect(form.validateField).not.toHaveBeenCalled();
    });

    it("returns ok:true for a formMeta-validated step with no fields", async () => {
      const step = makeStep("step-1", []);
      const formMeta = { validationProperties: {} } as any;
      const form = { validateField: vi.fn(), getFieldValue: vi.fn() } as any;

      const result = await validateStep(form, step, formMeta);

      expect(result).toEqual({ ok: true, results: [] });
    });
  });
});
