/**
 * jump-walk.spec.tsx
 *
 * Unit tests for the forward-jump validation walk (#1864 phase 2): clicking
 * a step-progress-map node walks the steps between the current one and the
 * target, validating each with the same logic Continue uses, and stops on
 * the first failure. See jump-walk.spike.spec.tsx for why the current
 * (mounted) step and every other (unmounted) step in the walk need different
 * validation paths.
 */

import { render } from "@testing-library/react";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import type { AnyFormApi } from "@tanstack/react-form";
import { walkToStep } from "./jump-walk";
import type {
  ClientFormStep,
  ClientPrimitive,
  FieldValidationProperties,
  FormMeta,
} from "@forms/types";

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

function makeForm({
  validateField = () => [],
  getFieldValue = () => undefined,
}: {
  validateField?: (fieldId: string) => string[];
  getFieldValue?: (fieldId: string) => unknown;
} = {}) {
  return {
    validateField: vi.fn(validateField),
    getFieldValue: vi.fn(getFieldValue),
  } as any;
}

function makeFormMeta(
  validationProperties: Record<string, FieldValidationProperties> = {},
): FormMeta {
  return { validationProperties } as FormMeta;
}

describe("walkToStep", () => {
  it("backward jump returns the target unchanged without validating anything", async () => {
    const steps = [
      makeStep("step-1", ["a"]),
      makeStep("step-2", ["b"]),
      makeStep("step-3", ["c"]),
    ];
    const form = makeForm();

    const result = await walkToStep(form, makeFormMeta(), steps, 2, "step-1");

    expect(result).toEqual({ targetStepId: "step-1", blocked: false });
    expect(form.validateField).not.toHaveBeenCalled();
    expect(form.getFieldValue).not.toHaveBeenCalled();
  });

  it("jumping to the current step returns it unchanged without validating anything", async () => {
    const steps = [makeStep("step-1", ["a"]), makeStep("step-2", ["b"])];
    const form = makeForm();

    const result = await walkToStep(form, makeFormMeta(), steps, 1, "step-2");

    expect(result).toEqual({ targetStepId: "step-2", blocked: false });
    expect(form.validateField).not.toHaveBeenCalled();
  });

  it("forward jump lands on the target when every intermediate step passes", async () => {
    const steps = [
      makeStep("step-1", ["a"]),
      makeStep("step-2", ["b"]),
      makeStep("step-3", ["c"]),
    ];
    const form = makeForm({
      validateField: () => [],
      getFieldValue: () => "filled",
    });
    const formMeta = makeFormMeta({
      "step-2_b": { onDynamic: () => undefined },
    });

    const result = await walkToStep(form, formMeta, steps, 0, "step-3");

    expect(result).toEqual({ targetStepId: "step-3", blocked: false });
  });

  it("forward jump stops at the first failing intermediate step", async () => {
    const steps = [
      makeStep("step-1", ["a"]),
      makeStep("step-2", ["b"]),
      makeStep("step-3", ["c"]),
      makeStep("step-4", ["d"]),
    ];
    const form = makeForm({
      validateField: () => [], // current step (step-1) passes
      getFieldValue: (fieldId) => (fieldId === "step-2_b" ? "" : "filled"),
    });
    const formMeta = makeFormMeta({
      "step-2_b": {
        onDynamic: ({ value }) => (value ? undefined : ["Required"]),
      },
      "step-3_c": { onDynamic: () => undefined },
    });

    const result = await walkToStep(form, formMeta, steps, 0, "step-4");

    expect(result).toEqual({ targetStepId: "step-2", blocked: true });
    // Must stop at the first failure — step-3 is never reached.
    expect(form.getFieldValue).not.toHaveBeenCalledWith("step-3_c");
  });

  it("blocks immediately when the current (mounted) step itself is invalid", async () => {
    const steps = [
      makeStep("step-1", ["a"]),
      makeStep("step-2", ["b"]),
      makeStep("step-3", []),
    ];
    const form = makeForm({ validateField: () => ["Required"] });

    const result = await walkToStep(form, makeFormMeta(), steps, 0, "step-3");

    expect(result).toEqual({ targetStepId: "step-1", blocked: true });
    expect(form.validateField).toHaveBeenCalledWith("step-1_a", "submit");
    // Never reached step-2's fallback validation.
    expect(form.getFieldValue).not.toHaveBeenCalled();
  });

  it("a content-only intermediate step (no fields) trivially passes", async () => {
    const steps = [
      makeStep("step-1", ["a"]),
      makeStep("intro", []),
      makeStep("step-3", ["c"]),
    ];
    const form = makeForm({
      validateField: () => [],
      getFieldValue: () => "filled",
    });
    const formMeta = makeFormMeta({
      "step-3_c": { onDynamic: () => undefined },
    });

    const result = await walkToStep(form, formMeta, steps, 0, "step-3");

    expect(result).toEqual({ targetStepId: "step-3", blocked: false });
  });

  it("target adjacent to the current step validates only the current step", async () => {
    const steps = [makeStep("step-1", ["a"]), makeStep("step-2", ["b"])];
    const form = makeForm({ validateField: () => [] });

    const result = await walkToStep(form, makeFormMeta(), steps, 0, "step-2");

    expect(result).toEqual({ targetStepId: "step-2", blocked: false });
    expect(form.validateField).toHaveBeenCalledWith("step-1_a", "submit");
    expect(form.validateField).toHaveBeenCalledTimes(1);
    expect(form.getFieldValue).not.toHaveBeenCalled();
  });

  // Real TanStack form: proves the wiring end-to-end, not just the stubs —
  // in particular, that a never-mounted intermediate step's stale-invalid
  // value is actually caught via the formMeta fallback rather than silently
  // waved through (which is exactly what plain form.validateField would do
  // for it; see jump-walk.spike.spec.tsx).
  it("real TanStack form: catches an invalid never-mounted intermediate step via the fallback", async () => {
    const steps = [
      makeStep("step-1", ["a"]),
      makeStep("step-2", ["b"]),
      makeStep("step-3", []),
    ];
    const required: FieldValidationProperties = {
      onDynamic: ({ value }) => (value ? undefined : ["Required"]),
    };
    const formMeta = makeFormMeta({
      "step-1_a": required,
      "step-2_b": required,
    });

    const formRef: { current: AnyFormApi | null } = { current: null };
    function Harness() {
      const form = useForm({
        validationLogic: revalidateLogic({
          mode: "submit",
          modeAfterSubmission: "change",
        }),
        defaultValues: { "step-1_a": "filled", "step-2_b": "" },
      });
      formRef.current = form as unknown as AnyFormApi;
      const Field = form.Field;
      return (
        <Field name="step-1_a" validators={required}>
          {() => null}
        </Field>
      );
    }
    render(<Harness />);

    const result = await walkToStep(
      formRef.current!,
      formMeta,
      steps,
      0,
      "step-3",
    );

    expect(result).toEqual({ targetStepId: "step-2", blocked: true });
  });
});
