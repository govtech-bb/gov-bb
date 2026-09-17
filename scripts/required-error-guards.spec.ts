import type { Block, Primitive } from "@govtech-bb/form-types";
import { checkRequiredErrorsAreSpecific } from "./required-error-guards";

// A stand-in for BUILTIN_REGISTRY carrying exactly the shapes the guard has to
// tell apart: a generic primitive that ships the generic message, a named
// component that ships a good one, a date, and a block wrapping the component.
const GENERIC_TEXT: Primitive = {
  fieldId: "generic-text",
  htmlType: "text",
  label: "Text",
  validations: { required: { value: true, error: "This field is required" } },
};

const FIRST_NAME: Primitive = {
  fieldId: "first-name",
  htmlType: "text",
  label: "First name",
  validations: { required: { value: true, error: "First name is required" } },
};

const GENERIC_DATE: Primitive = {
  fieldId: "generic-date",
  htmlType: "date",
  label: "Date",
  validations: { required: { value: true } },
};

const PERSONAL_INFORMATION: Block = {
  blockId: "personal-information",
  blockDescription: "",
  blockVersion: "1.0.0",
  elements: [FIRST_NAME, { ...FIRST_NAME, fieldId: "last-name" }],
};

const REGISTRY = {
  "components/generic-text": GENERIC_TEXT,
  "components/first-name": FIRST_NAME,
  "components/generic-date": GENERIC_DATE,
  "blocks/personal-information": PERSONAL_INFORMATION,
};

function recipe(ref: string, overrides?: unknown) {
  return { steps: [{ stepId: "employment", elements: [{ ref, overrides }] }] };
}

function check(r: unknown) {
  return checkRequiredErrorsAreSpecific(r, "r.json", REGISTRY);
}

describe("checkRequiredErrorsAreSpecific", () => {
  it("flags a generic primitive that only overrides fieldId and label", () => {
    const errors = check(
      recipe("components/generic-text", {
        fieldId: "employer",
        label: "Employer",
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("r.json: employment.employer");
    expect(errors[0]).toContain("components/generic-text");
    expect(errors[0]).toContain('uses the generic "This field is required"');
  });

  // `validations` merge per rule key, so restating `required` replaces the
  // component's whole rule — the shipped message goes with it.
  it("flags an override that restates required over a component with a good message", () => {
    const errors = check(
      recipe("components/first-name", {
        validations: { required: { value: true } },
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("employment.first-name");
    expect(errors[0]).toContain("has no required.error");
  });

  it("accepts a field with a specific authored error", () => {
    expect(
      check(
        recipe("components/generic-text", {
          fieldId: "employer",
          validations: {
            required: { value: true, error: "Enter your employer's name" },
          },
        }),
      ),
    ).toEqual([]);
  });

  it("accepts a field that is not required", () => {
    expect(
      check(
        recipe("components/generic-text", {
          fieldId: "nickname",
          validations: { required: { value: false } },
        }),
      ),
    ).toEqual([]);
  });

  // validateDateField never reaches the required runner: with no authored
  // `error` it composes `Enter ${label}` itself, so the field already names
  // itself and must NOT be flagged.
  it("accepts a date field with no required.error", () => {
    expect(
      check(
        recipe("components/generic-date", {
          fieldId: "start-date",
          label: "Start date",
        }),
      ),
    ).toEqual([]);
  });

  it("flags a block child whose override drops the message, and only that child", () => {
    const errors = check(
      recipe("blocks/personal-information", {
        "last-name": { validations: { required: { value: true } } },
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("employment.last-name");
    expect(errors[0]).toContain("blocks/personal-information");
  });

  it("flags the generic message authored by hand", () => {
    const errors = check(
      recipe("components/first-name", {
        validations: {
          required: { value: true, error: "This field is required" },
        },
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("uses the generic");
  });

  // Mirrors validateFieldEntries: `required` present with no `value` is
  // required, so the message still matters.
  it("treats required with no value as required", () => {
    const errors = check(
      recipe("components/first-name", { validations: { required: {} } }),
    );
    expect(errors).toHaveLength(1);
  });

  it("ignores unresolved refs and malformed recipes", () => {
    expect(check(recipe("components/nope", { fieldId: "x" }))).toEqual([]);
    expect(check({})).toEqual([]);
    expect(check({ steps: [{ stepId: "s" }] })).toEqual([]);
  });
});
