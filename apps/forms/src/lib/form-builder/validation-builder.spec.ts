/**
 * validation-builder.spec.ts
 *
 * Unit tests for the validation builder.
 *
 * Field rule-checking is delegated to `@govtech-bb/form-validation` (the single
 * source of truth, also used by `apps/api`). These tests cover the builder's
 * own responsibilities:
 *  - buildValidation: defaults + per-field validation properties
 *  - buildFieldValidationProperties: show-hide / no-validation pass-through,
 *    onBlur date normalization, onChange delegating to the shared validator,
 *    onChangeListenTo from behaviours, and cross-field rule resolution.
 */

import {
  buildValidation,
  buildFieldValidationProperties,
} from "./validation-builder";
import type { ClientServiceContract, ClientPrimitive } from "@forms/types";
import type { AnyFieldApi } from "@tanstack/react-form";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

function makeField(
  fieldId: string,
  stepId: string,
  overrides: Partial<ClientPrimitive> = {},
): ClientPrimitive {
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
    ...overrides,
  };
}

function makeContract(
  steps: ClientServiceContract["steps"],
): ClientServiceContract {
  return {
    formId: "test-form",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    steps,
  };
}

// The live form keys its value map by the composite `field.id`
// (`stepId_fieldId`); `form.state.values` is what the onChange handler reads to
// assemble the cross-field value tree.
function makeFieldApi(
  fieldValues: Record<string, unknown> = {},
  name = "step1_field",
): AnyFieldApi {
  return {
    name,
    form: {
      state: { values: fieldValues },
      getFieldValue: (id: string) => fieldValues[id],
    },
    handleChange: jest.fn(),
  } as unknown as AnyFieldApi;
}

// ---------------------------------------------------------------------------
// buildValidation
// ---------------------------------------------------------------------------

describe("buildValidation", () => {
  it("populates defaults for fields with defaultValue", () => {
    const contract = makeContract([
      {
        stepId: "step1",
        title: "Step 1",
        fields: [
          makeField("country", "step1", { defaultValue: "Barbados" }),
          makeField("city", "step1"),
        ],
      },
    ]);

    const { defaults } = buildValidation(contract);

    expect(defaults["step1_country"]).toBe("Barbados");
    expect(defaults["step1_city"]).toBeUndefined();
  });

  it("does not populate defaults for fields without defaultValue", () => {
    const contract = makeContract([
      {
        stepId: "step1",
        title: "Step 1",
        fields: [makeField("name", "step1")],
      },
    ]);

    const { defaults } = buildValidation(contract);
    expect(Object.keys(defaults)).toHaveLength(0);
  });

  it("returns a properties map with a key for each field", () => {
    const contract = makeContract([
      {
        stepId: "step1",
        title: "Step 1",
        fields: [makeField("name", "step1"), makeField("email", "step1")],
      },
      {
        stepId: "step2",
        title: "Step 2",
        fields: [makeField("phone", "step2")],
      },
    ]);

    const { properties } = buildValidation(contract);
    expect(properties["step1_name"]).toBeDefined();
    expect(properties["step1_email"]).toBeDefined();
    expect(properties["step2_phone"]).toBeDefined();
    expect(typeof properties["step1_name"].onChange).toBe("function");
  });

  it("handles an empty contract with no steps", () => {
    const { defaults, properties } = buildValidation(makeContract([]));
    expect(Object.keys(defaults)).toHaveLength(0);
    expect(Object.keys(properties)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildFieldValidationProperties
// ---------------------------------------------------------------------------

describe("buildFieldValidationProperties", () => {
  // --- show-hide pass-through ---

  describe("show-hide field", () => {
    it("returns no-op onBlur and onChange", () => {
      const field = makeField("toggle", "step1", {
        htmlType: "show-hide",
        validations: { required: { value: true, error: "Required." } },
      });
      const { onBlur, onChange } = buildFieldValidationProperties(field);

      expect(typeof onBlur).toBe("function");
      expect(typeof onChange).toBe("function");
      const fieldApi = makeFieldApi();
      expect(onBlur!({ value: true, fieldApi })).toBeUndefined();
      expect(onChange!({ value: true, fieldApi })).toBeUndefined();
    });
  });

  // --- No validations ---

  describe("when field has no validations", () => {
    it("returns no-op onBlur and onChange", () => {
      const field = makeField("name", "step1");
      const { onBlur, onChange } = buildFieldValidationProperties(field);

      expect(typeof onBlur).toBe("function");
      expect(typeof onChange).toBe("function");

      const fieldApi = makeFieldApi();
      expect(onBlur!({ value: "any", fieldApi })).toBeUndefined();
      expect(onChange!({ value: "any", fieldApi })).toBeUndefined();
    });

    it("does not include onChangeListenTo", () => {
      const field = makeField("name", "step1");
      const { onChangeListenTo } = buildFieldValidationProperties(field);
      // When no validations, early return — onChangeListenTo not set
      expect(onChangeListenTo).toBeUndefined();
    });
  });

  // --- onChangeListenTo from behaviours ---

  describe("onChangeListenTo", () => {
    it("is populated from behaviours that have targetFieldId", () => {
      const field = makeField("name", "step1", {
        validations: {},
        behaviours: [
          {
            type: "fieldConditionalOn",
            targetStepId: "step1",
            targetFieldId: "colour",
            operator: "equal",
            value: "red",
          },
        ],
      });
      const { onChangeListenTo } = buildFieldValidationProperties(field);
      expect(onChangeListenTo).toContain("colour");
    });

    it("is empty array when behaviours have no targetFieldId", () => {
      const field = makeField("name", "step1", {
        validations: {},
        behaviours: [{ type: "repeatable", min: 1, max: 3 }],
      });
      const { onChangeListenTo } = buildFieldValidationProperties(field);
      expect(onChangeListenTo).toEqual([]);
    });

    it("is empty array when behaviours is absent", () => {
      const field = makeField("name", "step1", { validations: {} });
      const { onChangeListenTo } = buildFieldValidationProperties(field);
      expect(onChangeListenTo).toEqual([]);
    });
  });

  // --- date field onBlur (UI normalization, preserved verbatim) ---

  describe("date field onBlur", () => {
    const dateField = makeField("dob", "step1", {
      htmlType: "date",
      validations: {},
    });

    it("does nothing when value is undefined", () => {
      const { onBlur } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      expect(onBlur!({ value: undefined, fieldApi })).toBeUndefined();
      expect(fieldApi.handleChange).not.toHaveBeenCalled();
    });

    it("does nothing when date is incomplete", () => {
      const { onBlur } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      // Missing year
      onBlur!({ value: { day: 15, month: 6 }, fieldApi });
      expect(fieldApi.handleChange).not.toHaveBeenCalled();
    });

    it("does not call handleChange when all date parts match the parsed date", () => {
      const { onBlur } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      // June 15, 2024 — should parse cleanly
      onBlur!({ value: { day: 15, month: 6, year: 2024 }, fieldApi });
      expect(fieldApi.handleChange).not.toHaveBeenCalled();
    });

    it("calls handleChange when date overflows (e.g. day=32 rolls over to next month)", () => {
      const { onBlur } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      // January 32 = February 1
      onBlur!({ value: { day: 32, month: 1, year: 2024 }, fieldApi });
      expect(fieldApi.handleChange).toHaveBeenCalledWith({
        day: 1,
        month: 2,
        year: 2024,
      });
    });

    it("returns undefined", () => {
      const { onBlur } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      const result = onBlur!({
        value: { day: 15, month: 6, year: 2024 },
        fieldApi,
      });
      expect(result).toBeUndefined();
    });
  });

  // --- onBlur on non-date fields ---

  describe("non-date field onBlur", () => {
    it("returns undefined and never normalizes", () => {
      const field = makeField("name", "step1", {
        validations: { required: { value: true, error: "Required." } },
      });
      const { onBlur } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      expect(onBlur!({ value: "John", fieldApi })).toBeUndefined();
      expect(fieldApi.handleChange).not.toHaveBeenCalled();
    });
  });

  // --- date field onChange ---

  describe("date field onChange", () => {
    const dateField = makeField("dob", "step1", {
      htmlType: "date",
      validations: { required: { value: true, error: "Required." } },
    });

    it("returns errors when date is undefined and field is required", () => {
      const { onChange } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: undefined, fieldApi });
      // undefined is treated as empty → required field returns errors
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(["Required."]);
    });

    it("returns errors when value is empty and field is required", () => {
      const { onChange } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: "", fieldApi });
      expect(Array.isArray(result)).toBe(true);
    });

    it("treats an incomplete date as empty (required fires)", () => {
      const { onChange } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: { day: 15, month: 6 }, fieldApi });
      expect(result).toEqual(["Required."]);
    });

    it("returns undefined when onChange is called with a complete DateValue and no constraints", () => {
      const { onChange } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      const result = onChange!({
        value: { day: 15, month: 6, year: 2024 },
        fieldApi,
      });
      expect(result).toBeUndefined();
    });

    it("returns errors when date is in the future and field has past constraint", () => {
      const field = makeField("eventDate", "step1", {
        htmlType: "date",
        validations: {
          required: { value: true, error: "Required." },
          past: { value: true, error: "Date must be in the past." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      // Compute a future date dynamically so the test does not become a
      // time bomb (e.g. a hardcoded year that ages out into the past).
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const result = onChange!({
        value: {
          day: future.getDate(),
          month: future.getMonth() + 1,
          year: future.getFullYear(),
        },
        fieldApi,
      });
      expect(result).toEqual(["Date must be in the past."]);
    });
  });

  // --- checkbox field onChange ---

  describe("checkbox field onChange", () => {
    const checkboxField = makeField("tags", "step1", {
      htmlType: "checkbox",
      validations: {
        required: { value: true, error: "Required." },
        minSelection: { value: 2, error: "Pick at least 2." },
      },
    });

    it("returns errors when an array value has fewer than minSelection", () => {
      const { onChange } = buildFieldValidationProperties(checkboxField);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: ["a"], fieldApi });
      expect(result).toEqual(["Pick at least 2."]);
    });

    it("returns undefined when selection meets minSelection", () => {
      const { onChange } = buildFieldValidationProperties(checkboxField);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: ["a", "b"], fieldApi });
      expect(result).toBeUndefined();
    });

    it("treats a boolean-false checkbox as empty (required fires)", () => {
      const field = makeField("consent", "step1", {
        htmlType: "checkbox",
        validations: { required: { value: true, error: "You must consent." } },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      expect(onChange!({ value: false, fieldApi })).toEqual([
        "You must consent.",
      ]);
      expect(onChange!({ value: true, fieldApi })).toBeUndefined();
    });

    it("returns undefined when value is not a boolean or array", () => {
      const { onChange } = buildFieldValidationProperties(checkboxField);
      const fieldApi = makeFieldApi();
      // Non-array, non-boolean value short-circuits as "unknown" → no error.
      const result = onChange!({ value: { some: "object" }, fieldApi });
      expect(result).toBeUndefined();
    });
  });

  // --- string field onChange ---

  describe("string field onChange", () => {
    it("returns errors when required string field is empty", () => {
      const field = makeField("name", "step1", {
        validations: { required: { value: true, error: "Name is required." } },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: "", fieldApi });
      expect(Array.isArray(result)).toBe(true);
      expect(
        (result as string[]).some((e) => e.includes("Name is required.")),
      ).toBe(true);
    });

    it("returns undefined when optional string field is empty", () => {
      const field = makeField("name", "step1", { validations: {} });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: "", fieldApi });
      expect(result).toBeUndefined();
    });

    it("returns errors when string fails maxLength validation", () => {
      const field = makeField("bio", "step1", {
        validations: {
          required: { value: false },
          maxLength: { value: 5, error: "Too long." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: "hello world", fieldApi });
      expect(result).toEqual(["Too long."]);
    });

    it("preserves the configured error message verbatim", () => {
      const field = makeField("postcode", "step1", {
        validations: {
          required: { value: true, error: "Required." },
          pattern: { value: "^BB\\d{5}$", error: "Enter a valid postcode." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: "nope", fieldApi });
      expect(result).toEqual(["Enter a valid postcode."]);
    });

    it("returns undefined when string passes all validations", () => {
      const field = makeField("bio", "step1", {
        validations: {
          required: { value: true, error: "Required." },
          maxLength: { value: 100 },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: "Hello", fieldApi });
      expect(result).toBeUndefined();
    });
  });

  // --- file field onChange ---

  describe("file field onChange", () => {
    function makeFileList(...files: File[]): FileList {
      return Object.assign(files, {
        item: (i: number) => files[i] ?? null,
      }) as unknown as FileList;
    }

    function makeFile(
      name: string,
      sizeBytes: number,
      type = "text/plain",
    ): File {
      const blob = new Blob(["x".repeat(sizeBytes)], { type });
      return new File([blob], name, { type });
    }

    it("returns errors when file exceeds maxSize", () => {
      const field = makeField("upload", "step1", {
        htmlType: "file",
        validations: {
          required: { value: true, error: "Required." },
          maxSize: { value: 100, error: "File too large." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const files = makeFileList(makeFile("big.pdf", 500));
      const result = onChange!({ value: files, fieldApi });
      expect(result).toEqual(["File too large."]);
    });

    it("returns errors when required file field has no files", () => {
      const field = makeField("upload", "step1", {
        htmlType: "file",
        validations: { required: { value: true, error: "Upload a file." } },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: makeFileList(), fieldApi });
      expect(result).toEqual(["Upload a file."]);
    });

    it("treats a null file value (cleared input) as empty", () => {
      const field = makeField("upload", "step1", {
        htmlType: "file",
        validations: { required: { value: true, error: "Upload a file." } },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: null, fieldApi });
      expect(result).toEqual(["Upload a file."]);
    });

    it("returns undefined for a valid file within size limits", () => {
      const field = makeField("upload", "step1", {
        htmlType: "file",
        validations: {
          required: { value: true, error: "Required." },
          maxSize: { value: 10000 },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const files = makeFileList(makeFile("small.pdf", 100));
      const result = onChange!({ value: files, fieldApi });
      expect(result).toBeUndefined();
    });
  });

  // --- cross-field rule resolution (regression: these did not resolve on the
  // client before this migration) ---

  describe("cross-field rule resolution", () => {
    it("resolves a gt rule against another field in the same step", () => {
      const field = makeField("quantity", "step1", {
        htmlType: "number",
        validations: {
          gt: {
            value: 0,
            referenceFieldId: "minQty",
            error: "Must be greater than the minimum.",
          },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi({ step1_minQty: 5 }, "step1_quantity");

      expect(onChange!({ value: 3, fieldApi })).toEqual([
        "Must be greater than the minimum.",
      ]);
      expect(onChange!({ value: 9, fieldApi })).toBeUndefined();
    });

    it("resolves a strictEquality rule against another field", () => {
      const field = makeField("confirmEmail", "step1", {
        htmlType: "text",
        validations: {
          strictEquality: {
            value: "",
            referenceFieldId: "email",
            error: "Emails must match.",
          },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi(
        { step1_email: "me@example.com" },
        "step1_confirmEmail",
      );

      expect(onChange!({ value: "other@example.com", fieldApi })).toEqual([
        "Emails must match.",
      ]);
      expect(onChange!({ value: "me@example.com", fieldApi })).toBeUndefined();
    });

    it("resolves a date 'after' rule against another field", () => {
      const field = makeField("endDate", "step1", {
        htmlType: "date",
        validations: {
          after: {
            value: "",
            referenceFieldId: "startDate",
            error: "End date must be after the start date.",
          },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi(
        { step1_startDate: { day: 10, month: 6, year: 2024 } },
        "step1_endDate",
      );

      expect(
        onChange!({ value: { day: 1, month: 6, year: 2024 }, fieldApi }),
      ).toEqual(["End date must be after the start date."]);
      expect(
        onChange!({ value: { day: 20, month: 6, year: 2024 }, fieldApi }),
      ).toBeUndefined();
    });

    it("tolerates a separator-less key in form state", () => {
      // Defensive: a stray value keyed without the step separator must not
      // break tree assembly for the field being validated.
      const field = makeField("quantity", "step1", {
        htmlType: "number",
        validations: {
          gt: {
            value: 0,
            referenceFieldId: "minQty",
            error: "Too small.",
          },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi(
        { step1_minQty: 5, loose: "stray" },
        "step1_quantity",
      );
      expect(onChange!({ value: 3, fieldApi })).toEqual(["Too small."]);
    });

    it("resolves a reference to a field in another step via allValues", () => {
      const field = makeField("quantity", "step2", {
        htmlType: "number",
        validations: {
          gt: {
            value: 0,
            referenceFieldId: "minQty",
            referenceStepId: "step1",
            targetStepId: "step1",
            error: "Must exceed the step 1 minimum.",
          },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi({ step1_minQty: 100 }, "step2_quantity");

      expect(onChange!({ value: 50, fieldApi })).toEqual([
        "Must exceed the step 1 minimum.",
      ]);
      expect(onChange!({ value: 150, fieldApi })).toBeUndefined();
    });
  });

  // --- array of strings onChange ---

  describe("array of strings onChange", () => {
    it("validates each element and errors when one violates a rule", () => {
      const field = makeField("tags", "step1", {
        validations: {
          required: { value: true, error: "Required." },
          maxLength: { value: 3, error: "Too long." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      // "toolong" (7) exceeds maxLength 3 while "ok" (2) is fine — per-element.
      expect(onChange!({ value: ["ok", "toolong"], fieldApi })).toEqual([
        "Too long.",
      ]);
    });

    it("passes when every element satisfies the rule (per-element, not joined)", () => {
      const field = makeField("tags", "step1", {
        validations: {
          required: { value: true, error: "Required." },
          maxLength: { value: 3, error: "Too long." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      // Joining would make "ab,cd" (len 5) and fail; per-element each is len 2.
      expect(onChange!({ value: ["ab", "cd"], fieldApi })).toBeUndefined();
    });

    it("returns undefined when an array of empty strings passes", () => {
      const field = makeField("tags", "step1", {
        validations: {
          required: { value: false },
          maxLength: { value: 3, error: "Too long." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: ["", ""], fieldApi });
      expect(result).toBeUndefined();
    });
  });

  // --- error formatting (preserves the app's local wording behaviour) ---

  describe("error formatting", () => {
    it("strips the field name from errors after the first", () => {
      const field = makeField("email", "step1", {
        name: "Email",
        validations: {
          minLength: { value: 5, error: "Email too short" },
          pattern: { value: "^[0-9]+$", error: "Email format wrong" },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      // "ab": fails minLength (<5) and pattern (non-numeric). The first error
      // is verbatim; the field name is stripped from subsequent ones.
      expect(onChange!({ value: "ab", fieldApi })).toEqual([
        "Email too short",
        " format wrong",
      ]);
    });

    it("de-duplicates identical messages", () => {
      const field = makeField("code", "step1", {
        validations: {
          pattern: { value: "^X$", error: "Bad" },
          contains: { value: "ZZZ", error: "Bad" },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      expect(onChange!({ value: "ab", fieldApi })).toEqual(["Bad"]);
    });
  });
});
