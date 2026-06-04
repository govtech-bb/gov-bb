/**
 * field-mapper.spec.ts
 *
 * Unit tests for the field-mapper functions.
 *
 * Coverage:
 *  - stepFieldIdConcactenator: constant value
 *  - getFullFieldId: concatenation
 *  - mapFieldToLocale: various field configurations
 *  - mapStepToLocale: step with multiple elements
 *  - mapContractToLocale: full contract round-trip
 */

import {
  stepFieldIdConcactenator,
  getFullFieldId,
  mapFieldToLocale,
  mapStepToLocale,
  mapContractToLocale,
} from "./field-mapper";
import type {
  Primitive,
  FormStep,
  ServiceContract,
} from "@govtech-bb/form-types";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

function makeStep(stepId: string, elements: Primitive[] = []): FormStep {
  return {
    stepId,
    title: `Step ${stepId}`,
    elements,
  };
}

function makeTextField(
  fieldId: string,
  overrides: Partial<Primitive> = {},
): Primitive {
  return {
    fieldId,
    label: "My Label",
    htmlType: "text",
    ...overrides,
  } as Primitive;
}

// ---------------------------------------------------------------------------
// stepFieldIdConcactenator
// ---------------------------------------------------------------------------

describe("stepFieldIdConcactenator", () => {
  it("is an underscore", () => {
    expect(stepFieldIdConcactenator).toBe("_");
  });
});

// ---------------------------------------------------------------------------
// getFullFieldId
// ---------------------------------------------------------------------------

describe("getFullFieldId", () => {
  it("concatenates stepId and fieldId with an underscore", () => {
    expect(getFullFieldId("step1", "name")).toBe("step1_name");
  });

  it("works with multi-part step and field IDs", () => {
    expect(getFullFieldId("section-a", "first-name")).toBe(
      "section-a_first-name",
    );
  });

  it("uses the stepFieldIdConcactenator constant as separator", () => {
    const stepId = "s";
    const fieldId = "f";
    expect(getFullFieldId(stepId, fieldId)).toBe(
      `${stepId}${stepFieldIdConcactenator}${fieldId}`,
    );
  });
});

// ---------------------------------------------------------------------------
// mapFieldToLocale
// ---------------------------------------------------------------------------

describe("mapFieldToLocale", () => {
  const step = makeStep("step1");

  it("sets id from getFullFieldId(stepId, fieldId)", () => {
    const field = makeTextField("surname");
    const result = mapFieldToLocale(field, step);
    expect(result.id).toBe("step1_surname");
  });

  it("sets stepId from the step", () => {
    const field = makeTextField("surname");
    const result = mapFieldToLocale(field, step);
    expect(result.stepId).toBe("step1");
  });

  it("uses field.name when name is explicitly provided", () => {
    const field = makeTextField("firstName", { name: "firstName" });
    const result = mapFieldToLocale(field, step);
    expect(result.name).toBe("firstName");
  });

  it("derives name from label in sentence case when name is absent", () => {
    const field = makeTextField("surname", { label: "SURNAME" });
    const result = mapFieldToLocale(field, step);
    // toSentenceCase: first char upper, rest lower
    expect(result.name).toBe("Surname");
  });

  it("derives name as empty string when both name and label are absent", () => {
    const field = { fieldId: "x", htmlType: "text" } as unknown as Primitive;
    const result = mapFieldToLocale(field, step);
    expect(result.name).toBe("");
  });

  it("sets disabled to true when isDisabled is true", () => {
    const field = makeTextField("f", { isDisabled: true });
    const result = mapFieldToLocale(field, step);
    expect(result.disabled).toBe(true);
  });

  it("sets disabled to false when isDisabled is false", () => {
    const field = makeTextField("f", { isDisabled: false });
    const result = mapFieldToLocale(field, step);
    expect(result.disabled).toBe(false);
  });

  it("sets disabled to false when isDisabled is absent", () => {
    const field = makeTextField("f");
    const result = mapFieldToLocale(field, step);
    expect(result.disabled).toBe(false);
  });

  it("sets hidden to true when isHidden is true", () => {
    const field = makeTextField("f", { isHidden: true });
    const result = mapFieldToLocale(field, step);
    expect(result.hidden).toBe(true);
  });

  it("sets hidden to false when isHidden is absent", () => {
    const field = makeTextField("f");
    const result = mapFieldToLocale(field, step);
    expect(result.hidden).toBe(false);
  });

  it("always sets conditionallyHidden to false", () => {
    const field = makeTextField("f");
    const result = mapFieldToLocale(field, step);
    expect(result.conditionallyHidden).toBe(false);
  });

  it("spreads options from the source field", () => {
    const options = [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ];
    const field: Primitive = {
      fieldId: "agree",
      label: "Do you agree?",
      htmlType: "radio",
      options,
    };
    const result = mapFieldToLocale(field, step);
    expect(result.options).toEqual(options);
  });

  it("spreads validations from the source field", () => {
    const field = makeTextField("f", {
      validations: { required: { value: true, error: "Required." } },
    });
    const result = mapFieldToLocale(field, step);
    expect(result.validations?.required?.value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapStepToLocale
// ---------------------------------------------------------------------------

describe("mapStepToLocale", () => {
  it("maps each element in the step to a ClientPrimitive", () => {
    const fields: Primitive[] = [
      makeTextField("firstName", { name: "firstName" }),
      makeTextField("lastName", { name: "lastName" }),
    ];
    const step = makeStep("step1", fields);
    const result = mapStepToLocale(step);

    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].id).toBe("step1_firstName");
    expect(result.fields[1].id).toBe("step1_lastName");
  });

  it("spreads the original step properties", () => {
    const step = makeStep("step1", []);
    const result = mapStepToLocale(step);
    expect(result.stepId).toBe("step1");
    expect(result.title).toBe("Step step1");
  });

  it("produces an empty fields array when the step has no elements", () => {
    const step = makeStep("empty-step");
    const result = mapStepToLocale(step);
    expect(result.fields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mapContractToLocale
// ---------------------------------------------------------------------------

describe("mapContractToLocale", () => {
  it("maps all steps in the contract", () => {
    const contract: ServiceContract = {
      formId: "test-form",
      title: "Test Form",
      version: "1.0.0",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      steps: [
        makeStep("step1", [makeTextField("field1", { name: "field1" })]),
        makeStep("step2", [makeTextField("field2", { name: "field2" })]),
      ],
    };

    const result = mapContractToLocale(contract);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].stepId).toBe("step1");
    expect(result.steps[0].fields[0].id).toBe("step1_field1");
    expect(result.steps[1].stepId).toBe("step2");
    expect(result.steps[1].fields[0].id).toBe("step2_field2");
  });

  it("spreads top-level contract properties", () => {
    const contract: ServiceContract = {
      formId: "my-form",
      title: "My Form",
      description: "A description",
      version: "2.0.0",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-06-01T00:00:00Z",
      steps: [],
    };

    const result = mapContractToLocale(contract);

    expect(result.formId).toBe("my-form");
    expect(result.title).toBe("My Form");
    expect(result.description).toBe("A description");
    expect(result.version).toBe("2.0.0");
  });

  it("handles a contract with no steps", () => {
    const contract: ServiceContract = {
      formId: "empty-form",
      title: "Empty",
      version: "1.0.0",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      steps: [],
    };
    const result = mapContractToLocale(contract);
    expect(result.steps).toEqual([]);
  });
});
