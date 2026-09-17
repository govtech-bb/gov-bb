/**
 * #2227 / #2714: the single definition of "this required field would show the
 * citizen a message that names nothing". Both gates read it — the repo-side
 * `pnpm validate-recipes` guard and the Form Builder's Deploy gate — so the
 * two cannot drift on what counts as generic.
 */
import type { Primitive } from "@govtech-bb/form-types";
import { requiredMessageDefect } from "./required-message";

function field(partial: Partial<Primitive>): Primitive {
  return {
    fieldId: "employer-name",
    label: "Employer name",
    htmlType: "text",
    ...partial,
  } as Primitive;
}

it("flags a required field with no message", () => {
  expect(
    requiredMessageDefect(
      field({ validations: { required: { value: true } } }),
    ),
  ).toBe("missing");
});

it("flags a required field whose message is blank", () => {
  // `config.error ?? default` treats "" as authored, so the applicant gets an
  // empty error rather than the fallback — worse than generic, not better.
  expect(
    requiredMessageDefect(
      field({ validations: { required: { value: true, error: "  " } } }),
    ),
  ).toBe("missing");
});

it("flags a required field carrying the generic default verbatim", () => {
  expect(
    requiredMessageDefect(
      field({
        validations: {
          required: { value: true, error: "This field is required" },
        },
      }),
    ),
  ).toBe("generic");
});

it("passes a required field whose message names it", () => {
  expect(
    requiredMessageDefect(
      field({
        validations: {
          required: { value: true, error: "Employer name is required" },
        },
      }),
    ),
  ).toBeNull();
});

it("passes a field that declares no required rule", () => {
  expect(requiredMessageDefect(field({ validations: { minLength: {} } }))).toBe(
    null,
  );
});

it("passes a field required:false, whatever its message", () => {
  expect(
    requiredMessageDefect(
      field({ validations: { required: { value: false, error: "" } } }),
    ),
  ).toBeNull();
});

it("passes a date field with no message", () => {
  // validateDateField never reaches the required runner — it composes its own
  // label-aware "Enter ${label}", so a bare date field already names itself.
  expect(
    requiredMessageDefect(
      field({ htmlType: "date", validations: { required: { value: true } } }),
    ),
  ).toBeNull();
});

it("passes a field with no validations at all", () => {
  expect(requiredMessageDefect(field({}))).toBeNull();
});
