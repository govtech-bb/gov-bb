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

const GENERIC_RADIO: Primitive = {
  fieldId: "generic-radio",
  htmlType: "radio",
  label: "Radio",
  options: [],
  validations: { required: { value: true, error: "This field is required" } },
};

const GENERIC_DATE: Primitive = {
  fieldId: "generic-date",
  htmlType: "date",
  label: "Date",
  validations: { required: { value: true } },
};

const OPTIONAL_TEXT: Primitive = {
  fieldId: "optional-text",
  htmlType: "text",
  label: "Text",
};

const PERSONAL_INFORMATION: Block = {
  blockId: "personal-information",
  blockDescription: "",
  blockVersion: "1.0.0",
  elements: [FIRST_NAME, { ...FIRST_NAME, fieldId: "last-name" }],
};

const REGISTRY = {
  "components/generic-text": GENERIC_TEXT,
  "components/generic-radio": GENERIC_RADIO,
  "components/first-name": FIRST_NAME,
  "components/generic-date": GENERIC_DATE,
  "components/optional-text": OPTIONAL_TEXT,
  "blocks/personal-information": PERSONAL_INFORMATION,
};

function recipe(ref: string, overrides?: unknown) {
  return { steps: [{ stepId: "employment", elements: [{ ref, overrides }] }] };
}

function step(stepId: string, ...elements: unknown[]) {
  return { stepId, elements };
}

// A generic text field carrying its own required message.
function text(fieldId: string, error: string, extra?: object) {
  return {
    ref: "components/generic-text",
    overrides: {
      fieldId,
      validations: { required: { value: true, error } },
      ...extra,
    },
  };
}

function check(r: unknown) {
  return checkRequiredErrorsAreSpecific(r, "r.json", REGISTRY);
}

const IDENTICAL =
  "as required.error, so the error summary shows identical links";

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

  // The stock choice-field phrases name no field either, so two of them on one
  // step give the error summary two identical links — the same defect the
  // runtime default causes.
  it.each([
    "Select an option",
    "Select an answer",
    "Select yes or no",
    "Select at least one option",
  ])('flags the field-less stock message "%s"', (error) => {
    const errors = check(
      recipe("components/generic-radio", {
        fieldId: "has-co-applicant",
        validations: { required: { value: true, error } },
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`uses the generic "${error}"`);
  });

  // Authors punctuate and capitalise inconsistently ("Enter your address." is
  // live in the recipe set), so matching the exact string would let the same
  // message through wearing a full stop.
  it.each(["Select an option.", "select an option", "  Select An Option  "])(
    'flags "%s" despite the casing and punctuation',
    (error) => {
      const errors = check(
        recipe("components/generic-radio", {
          fieldId: "has-co-applicant",
          validations: { required: { value: true, error } },
        }),
      );
      expect(errors).toHaveLength(1);
    },
  );

  it("accepts a Select message that names the field", () => {
    expect(
      check(
        recipe("components/generic-radio", {
          fieldId: "parish",
          validations: {
            required: { value: true, error: "Select your parish" },
          },
        }),
      ),
    ).toEqual([]);
  });

  // The date exemption exists because an UNAUTHORED date composes its own
  // label-aware message. An authored one is shown verbatim, so it is not exempt.
  it("flags a date field carrying an authored generic message", () => {
    const errors = check(
      recipe("components/generic-date", {
        fieldId: "start-date",
        label: "Start date",
        validations: {
          required: { value: true, error: "This field is required" },
        },
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("start-date");
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

  // The error summary uses each message as its link text, so ANY two required
  // fields on one step sharing a message give it identical links (#2723).
  describe("duplicate messages on a step", () => {
    it("flags two required fields on one step with the same message", () => {
      const errors = check({
        steps: [
          step(
            "parents",
            text("father-first-name", "Enter the first name"),
            text("mother-first-name", "Enter the first name"),
          ),
        ],
      });
      expect(errors).toEqual([
        `r.json: step parents — father-first-name and mother-first-name both use "Enter the first name" ${IDENTICAL}; give each a message naming its field`,
      ]);
    });

    it("flags messages that differ only by case or a trailing full stop", () => {
      const errors = check({
        steps: [
          step(
            "parents",
            text("a", "Enter the first name"),
            text("b", "enter the first name"),
            text("c", "Enter the first name."),
          ),
        ],
      });
      expect(errors).toEqual([
        `r.json: step parents — a, b and c all use "Enter the first name" ${IDENTICAL}; give each a message naming its field`,
      ]);
    });

    it("accepts the same message on different steps", () => {
      expect(
        check({
          steps: [
            step("father", text("first-name", "Enter the first name")),
            step("mother", text("first-name", "Enter the first name")),
          ],
        }),
      ).toEqual([]);
    });

    // An unauthored date derives `Enter ${label}`, so it has no message to
    // compare.
    it("ignores unauthored dates", () => {
      expect(
        check({
          steps: [
            step(
              "dates",
              { ref: "components/generic-date", overrides: { fieldId: "a" } },
              { ref: "components/generic-date", overrides: { fieldId: "b" } },
              text("c", "Enter the date"),
            ),
          ],
        }),
      ).toEqual([]);
    });

    it("flags a date whose authored message matches another field's", () => {
      const errors = check({
        steps: [
          step(
            "dates",
            {
              ref: "components/generic-date",
              overrides: {
                fieldId: "start-date",
                validations: {
                  required: { value: true, error: "Enter a date" },
                },
              },
            },
            text("end-date", "Enter a date"),
          ),
        ],
      });
      expect(errors).toEqual([
        `r.json: step dates — start-date and end-date both use "Enter a date" ${IDENTICAL}; give each a message naming its field`,
      ]);
    });

    it("ignores fields that are not required", () => {
      expect(
        check({
          steps: [
            step(
              "about",
              text("nickname", "Enter a name"),
              {
                ref: "components/generic-text",
                overrides: {
                  fieldId: "alias",
                  validations: {
                    required: { value: false, error: "Enter a name" },
                  },
                },
              },
              { ref: "components/optional-text", overrides: { fieldId: "x" } },
            ),
          ],
        }),
      ).toEqual([]);
    });

    // Show/hide conditions are ignored on purpose: the rewritten messages are
    // clearer either way, and reasoning about conditions is error-prone.
    it("flags fields shown on different answers to the same question", () => {
      const shownWhen = (value: string) => ({
        behaviours: [
          {
            type: "fieldConditionalOn",
            targetFieldId: "unit",
            operator: "equal",
            value,
          },
        ],
      });
      const errors = check({
        steps: [
          step(
            "room",
            text("length-metres", "Enter the length", shownWhen("metres")),
            text("length-feet", "Enter the length", shownWhen("feet")),
          ),
        ],
      });
      expect(errors).toEqual([
        `r.json: step room — length-metres and length-feet both use "Enter the length" ${IDENTICAL}; give each a message naming its field`,
      ]);
    });

    it("flags block children that inherit the same message", () => {
      const errors = check(recipe("blocks/personal-information"));
      expect(errors).toEqual([
        `r.json: step employment — first-name and last-name both use "First name is required" ${IDENTICAL}; give each a message naming its field`,
      ]);
    });

    // The denylist already reports these; one defect, one error.
    it("does not report generic, blank or missing messages again", () => {
      const errors = check({
        steps: [
          step(
            "employment",
            { ref: "components/generic-text", overrides: { fieldId: "a" } },
            { ref: "components/generic-text", overrides: { fieldId: "b" } },
            text("c", "  "),
            text("d", "  "),
            {
              ref: "components/first-name",
              overrides: {
                fieldId: "e",
                validations: { required: { value: true } },
              },
            },
            {
              ref: "components/first-name",
              overrides: {
                fieldId: "f",
                validations: { required: { value: true } },
              },
            },
          ),
        ],
      });
      expect(errors).toHaveLength(6);
      expect(errors[0]).toContain("employment.a");
      expect(errors[0]).toContain('uses the generic "This field is required"');
      expect(errors[1]).toContain("employment.b");
      expect(errors[1]).toContain("uses the generic");
      expect(errors[2]).toContain("employment.c");
      expect(errors[2]).toContain("blank required.error");
      expect(errors[3]).toContain("employment.d");
      expect(errors[3]).toContain("blank required.error");
      expect(errors[4]).toContain("employment.e");
      expect(errors[4]).toContain("has no required.error");
      expect(errors[5]).toContain("employment.f");
      expect(errors[5]).toContain("has no required.error");
    });
  });
});
