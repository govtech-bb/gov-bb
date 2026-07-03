/**
 * jump-walk.spike.spec.tsx
 *
 * SPIKE (#1864 phase 2): does `form.validateField(fieldId, "submit")` — the
 * exact call `validateStep` makes, and that `handleContinue` already relies
 * on for the CURRENT step — do anything useful for a field whose
 * `<form.Field>` is not currently mounted?
 *
 * The forward jump-walk needs to validate intermediate steps that are NOT
 * the currently-rendered step. Two candidate shapes exist:
 *  (a) TanStack retains the field's registered validator in `form.fieldInfo`
 *      after unmount, so `validateField` keeps working.
 *  (b) TanStack drops the live instance on unmount, so `validateField`
 *      degrades to a no-op for that field.
 *
 * FINDING (confirmed against @tanstack/form-core's source AND reproduced
 * live below): (b). Concretely, in FormApi.validateField:
 *
 *   const fieldInstance = this.fieldInfo[field]?.instance;
 *   if (!fieldInstance) {
 *     const { hasErrored } = this.validateSync(cause);      // FORM-level only
 *     ...
 *     return this.getFieldMeta(field)?.errors ?? [];        // whatever's cached
 *   }
 *
 * `fieldInfo[name].instance` is nulled out by FieldApi's unmount cleanup
 * (returned from `mount()`), which ALSO resets that field's `fieldMetaBase`
 * entry back to a fresh default (preserving only isTouched/isBlurred/isDirty)
 * — wiping any previously-recorded errorMap. So:
 *
 *   - Previously-mounted-then-unmounted field: validateField runs no
 *     field-level validator at all (only form-level `useForm({ validators })`,
 *     which this app never sets) and returns whatever is in fieldMeta right
 *     now — which unmount just wiped to empty. Net effect: SILENTLY PASSES,
 *     regardless of the field's actual (invalid) value.
 *   - Never-mounted field (registered only via defaultValues, no `<form.Field>`
 *     ever rendered for it): same code path, same silent pass — there was
 *     never a fieldMeta entry to report errors from.
 *   - Errors do NOT persist across unmount for rendering purposes either:
 *     the unmount cleanup clears the field's errorMap, so anything the
 *     ErrorSummary/field would have shown is gone the instant the step
 *     unmounts, well before any jump-walk logic runs.
 *
 * Consequence for jump-walk: it CANNOT rely on `validateStep`'s existing
 * `form.validateField` call for any step except the currently-mounted one
 * (index === currentIndex). Every other intermediate step needs the manual
 * fallback validated directly against `form.state.values` (see
 * `validateStep`'s `formMeta` overload and `jump-walk.ts`).
 *
 * `deleteField` is not implicated: nothing here calls it, and the walk only
 * ever iterates `visibleSteps` (steps already pruned of anything the
 * repeatable-remove flow purged via `form.deleteField` in `handleContinue`),
 * so the walk never inspects a deleted field.
 */

import { render } from "@testing-library/react";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import type { AnyFormApi } from "@tanstack/react-form";

// Bare-bones required-field validator, same shape (`onDynamic`) as
// `buildFieldValidationProperties` produces in the real app.
const required = {
  onDynamic: ({ value }: { value: unknown }) =>
    value ? undefined : ["Required"],
};

function Harness({
  formRef,
  mountA,
}: {
  formRef: { current: AnyFormApi | null };
  mountA: boolean;
}) {
  const form = useForm({
    validationLogic: revalidateLogic({
      mode: "submit",
      modeAfterSubmission: "change",
    }),
    defaultValues: { a: "", b: "" },
  });
  formRef.current = form as unknown as AnyFormApi;
  const Field = form.Field;

  return (
    <div>
      {mountA && (
        <Field name="a" validators={required}>
          {() => null}
        </Field>
      )}
      {/* field "b" is never mounted anywhere in this test — the
          never-mounted boundary case. */}
    </div>
  );
}

describe("SPIKE — validateField behaviour across mount states", () => {
  it("mounted field: validateField('submit') runs the field's own validator and populates fieldMeta", async () => {
    const formRef: { current: AnyFormApi | null } = { current: null };
    render(<Harness formRef={formRef} mountA={true} />);

    const errors = await formRef.current!.validateField("a", "submit");

    expect(errors).toEqual(["Required"]);
    expect(formRef.current!.getFieldMeta("a")?.errors).toEqual(["Required"]);
  });

  it("unmount wipes the field's previously-recorded errors from fieldMeta", async () => {
    const formRef: { current: AnyFormApi | null } = { current: null };
    const { rerender } = render(<Harness formRef={formRef} mountA={true} />);

    await formRef.current!.validateField("a", "submit");
    expect(formRef.current!.getFieldMeta("a")?.errors).toEqual(["Required"]);

    rerender(<Harness formRef={formRef} mountA={false} />);

    expect(formRef.current!.getFieldMeta("a")?.errors ?? []).toEqual([]);
  });

  it("previously-mounted-then-unmounted field: validateField('submit') silently passes despite an invalid value", async () => {
    const formRef: { current: AnyFormApi | null } = { current: null };
    const { rerender } = render(<Harness formRef={formRef} mountA={true} />);

    // Establish the field has a live, invalid value and had errors recorded.
    await formRef.current!.validateField("a", "submit");
    expect(formRef.current!.getFieldMeta("a")?.errors).toEqual(["Required"]);

    rerender(<Harness formRef={formRef} mountA={false} />);

    // Value is still "" (invalid per the `required` validator), but nothing
    // is mounted to run that validator any more.
    expect(formRef.current!.getFieldValue("a")).toBe("");

    const errors = await formRef.current!.validateField("a", "submit");

    expect(errors).toEqual([]);
    expect(formRef.current!.getFieldMeta("a")?.errors ?? []).toEqual([]);
  });

  it("never-mounted field: validateField('submit') silently passes even though its default value is empty", async () => {
    const formRef: { current: AnyFormApi | null } = { current: null };
    render(<Harness formRef={formRef} mountA={false} />);

    expect(formRef.current!.getFieldValue("b")).toBe("");

    const errors = await formRef.current!.validateField("b", "submit");

    expect(errors).toEqual([]);
    expect(formRef.current!.getFieldMeta("b")?.errors ?? []).toEqual([]);
  });
});
