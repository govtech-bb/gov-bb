/**
 * validation-builder.spec.ts
 *
 * Unit tests for the validation builder functions.
 *
 * Coverage:
 *  - buildValidation: schema shape, defaults, fieldValidationProperties
 *  - buildFieldValidation: show-hide boolean schema, regular field schema
 *  - buildFieldValidationProperties: no-op paths, date onBlur, checkbox onChange,
 *    string onChange, onChangeListenTo from behaviours
 */

import {
  buildValidation,
  buildFieldValidation,
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

function makeFieldApi(
  fieldValues: Record<string, unknown> = {},
  name = "step1_field",
): AnyFieldApi {
  return {
    name,
    form: { getFieldValue: (id: string) => fieldValues[id] },
    handleChange: jest.fn(),
  } as unknown as AnyFieldApi;
}

// ---------------------------------------------------------------------------
// buildValidation
// ---------------------------------------------------------------------------

describe("buildValidation", () => {
  it("returns a schema with a key for each field", () => {
    const contract = makeContract([
      {
        stepId: "step1",
        title: "Step 1",
        fields: [
          makeField("firstName", "step1"),
          makeField("lastName", "step1"),
        ],
      },
      {
        stepId: "step2",
        title: "Step 2",
        fields: [makeField("email", "step2"), makeField("phone", "step2")],
      },
    ]);

    const { schema } = buildValidation(contract);
    const shape = schema.shape;

    expect(Object.keys(shape)).toContain("step1_firstName");
    expect(Object.keys(shape)).toContain("step1_lastName");
    expect(Object.keys(shape)).toContain("step2_email");
    expect(Object.keys(shape)).toContain("step2_phone");
  });

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
        fields: [makeField("name", "step1")],
      },
    ]);

    const { properties } = buildValidation(contract);
    expect(properties["step1_name"]).toBeDefined();
    expect(typeof properties["step1_name"].onChange).toBe("function");
  });

  it("handles an empty contract with no steps", () => {
    const { schema, defaults, properties } = buildValidation(makeContract([]));
    expect(Object.keys(schema.shape)).toHaveLength(0);
    expect(Object.keys(defaults)).toHaveLength(0);
    expect(Object.keys(properties)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildFieldValidation
// ---------------------------------------------------------------------------

describe("buildFieldValidation", () => {
  it("returns z.boolean().optional() schema for show-hide fields", () => {
    const field = makeField("toggle", "step1", { htmlType: "show-hide" });
    const { fieldSchema } = buildFieldValidation(field);

    expect(fieldSchema.safeParse(true).success).toBe(true);
    expect(fieldSchema.safeParse(false).success).toBe(true);
    expect(fieldSchema.safeParse(undefined).success).toBe(true);
    // Non-boolean should fail
    expect(fieldSchema.safeParse("yes").success).toBe(false);
  });

  it("returns no-op onBlur/onChange for show-hide fields", () => {
    const field = makeField("toggle", "step1", { htmlType: "show-hide" });
    const { properties } = buildFieldValidation(field);

    expect(typeof properties.onBlur).toBe("function");
    expect(typeof properties.onChange).toBe("function");
    // They should be no-ops (return undefined)
    expect(
      properties.onBlur!({ value: true, fieldApi: makeFieldApi() }),
    ).toBeUndefined();
    expect(
      properties.onChange!({ value: true, fieldApi: makeFieldApi() }),
    ).toBeUndefined();
  });

  it("returns a z.any().superRefine schema for regular text fields", () => {
    const field = makeField("name", "step1", {
      validations: { required: { value: true, error: "Required." } },
    });
    const { fieldSchema } = buildFieldValidation(field);

    // Empty string is invalid (required)
    const result = fieldSchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("passes validation for a required field with a valid value", () => {
    const field = makeField("name", "step1", {
      validations: { required: { value: true, error: "Required." } },
    });
    const { fieldSchema } = buildFieldValidation(field);

    const result = fieldSchema.safeParse("John");
    expect(result.success).toBe(true);
  });

  it("returns properties with onChange for a regular field", () => {
    const field = makeField("name", "step1");
    const { properties } = buildFieldValidation(field);
    expect(typeof properties.onChange).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// buildFieldValidationProperties
// ---------------------------------------------------------------------------

describe("buildFieldValidationProperties", () => {
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

  // --- date field onBlur ---

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
    });

    it("returns errors when value is empty and field is required", () => {
      const { onChange } = buildFieldValidationProperties(dateField);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: "", fieldApi });
      expect(Array.isArray(result)).toBe(true);
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
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns undefined when selection meets minSelection", () => {
      const { onChange } = buildFieldValidationProperties(checkboxField);
      const fieldApi = makeFieldApi();
      const result = onChange!({ value: ["a", "b"], fieldApi });
      expect(result).toBeUndefined();
    });

    it("returns undefined when value is not a boolean or array", () => {
      const { onChange } = buildFieldValidationProperties(checkboxField);
      const fieldApi = makeFieldApi();
      // Non-array, non-boolean: onChange should return undefined
      const result = onChange!({ value: { some: "object" }, fieldApi });
      // The required check will return "unknownState" → undefined
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
      expect(Array.isArray(result)).toBe(true);
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
      expect(Array.isArray(result)).toBe(true);
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

  // --- array of strings onChange ---

  describe("array of strings onChange", () => {
    it("validates each non-empty string element in an array", () => {
      const field = makeField("tags", "step1", {
        validations: {
          required: { value: true, error: "Required." },
          maxLength: { value: 3, error: "Too long." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      // Array with a string that's too long
      const result = onChange!({ value: ["ok", "toolong"], fieldApi });
      expect(Array.isArray(result)).toBe(true);
    });

    it("skips empty strings in an array", () => {
      const field = makeField("tags", "step1", {
        validations: {
          required: { value: false },
          maxLength: { value: 3, error: "Too long." },
        },
      });
      const { onChange } = buildFieldValidationProperties(field);
      const fieldApi = makeFieldApi();
      // Array with only empty strings — should all be skipped
      const result = onChange!({ value: ["", ""], fieldApi });
      expect(result).toBeUndefined();
    });
  });
});
