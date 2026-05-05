import { evaluateFormConditions } from "./index";
import { evaluateCondition, flattenStepValues } from "./internals";
import type { ConditionResult, StepScopedValues } from "./index";
import type {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
  ServiceContract,
  Primitive,
} from "@govtech-bb/form-types";

// ─── helpers ───────────────────────────────────────────────────────────────

function makePrimitive(
  fieldId: string,
  behaviours?: FieldConditionalOnBehaviour[],
): Primitive {
  return {
    fieldId,
    label: fieldId,
    htmlType: "text",
    behaviours,
  } as unknown as Primitive;
}

function makeContract(
  steps: Array<{
    stepId: string;
    behaviours?: StepConditionalOnBehaviour[];
    fieldIds: string[];
    fieldBehaviours?: Record<string, FieldConditionalOnBehaviour[]>;
  }>,
): ServiceContract {
  return {
    formId: "test-form",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    steps: steps.map((s) => ({
      stepId: s.stepId,
      title: s.stepId,
      behaviours: s.behaviours,
      elements: s.fieldIds.map((id) =>
        makePrimitive(id, s.fieldBehaviours?.[id]),
      ),
    })),
  };
}

// Convenience: check if a fieldId is active/hidden in a specific step
const isActive = (result: ConditionResult, stepId: string, fieldId: string) =>
  result.activeFieldIds.get(stepId)?.has(fieldId) ?? false;

const isHidden = (result: ConditionResult, stepId: string, fieldId: string) =>
  result.hiddenFieldIds.get(stepId)?.has(fieldId) ?? false;

const EMPTY_VALUES: StepScopedValues = {};

// ─── flattenStepValues ──────────────────────────────────────────────────────

describe("flattenStepValues", () => {
  it("merges all step values into a single map", () => {
    const values: StepScopedValues = {
      "step-1": { "first-name": "Marcus", nationality: "JM" },
      "step-2": { "employer-name": "Ministry" },
    };
    expect(flattenStepValues(values)).toEqual({
      "first-name": "Marcus",
      nationality: "JM",
      "employer-name": "Ministry",
    });
  });

  it("returns empty object for empty input", () => {
    expect(flattenStepValues({})).toEqual({});
  });
});

// ─── evaluateCondition ──────────────────────────────────────────────────────

describe("evaluateCondition", () => {
  describe("operator: equal", () => {
    const behaviour: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetFieldId: "nationality",
      operator: "equal",
      value: "JM",
    };

    it("returns true when values match", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { nationality: "JM" }),
      ).toBe(true);
    });

    it("returns false when values differ", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { nationality: "US" }),
      ).toBe(false);
    });

    it("returns false when target is undefined", () => {
      expect(evaluateCondition(behaviour, EMPTY_VALUES, {})).toBe(false);
    });
  });

  describe("operator: notEqual", () => {
    const behaviour: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetFieldId: "status",
      operator: "notEqual",
      value: "inactive",
    };

    it("returns true when values differ", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { status: "active" }),
      ).toBe(true);
    });

    it("returns false when values match", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { status: "inactive" }),
      ).toBe(false);
    });

    it("returns true when target is undefined (undefined !== 'inactive')", () => {
      expect(evaluateCondition(behaviour, EMPTY_VALUES, {})).toBe(true);
    });
  });

  describe("operator: in", () => {
    const behaviour: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetFieldId: "country",
      operator: "in",
      value: ["JM", "BB", "TT"],
    };

    it("returns true when value is in the array", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { country: "JM" }),
      ).toBe(true);
    });

    it("returns false when value is not in the array", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { country: "US" }),
      ).toBe(false);
    });

    it("returns false when target is undefined", () => {
      expect(evaluateCondition(behaviour, EMPTY_VALUES, {})).toBe(false);
    });
  });

  describe("operator: exists", () => {
    const behaviour: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetFieldId: "employer",
      operator: "exists",
      value: "",
    };

    it("returns true when value is a non-empty string", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { employer: "ACME" }),
      ).toBe(true);
    });

    it("returns false when value is undefined", () => {
      expect(evaluateCondition(behaviour, EMPTY_VALUES, {})).toBe(false);
    });

    it("returns false when value is null", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { employer: null }),
      ).toBe(false);
    });

    it("returns false when value is empty string", () => {
      expect(evaluateCondition(behaviour, EMPTY_VALUES, { employer: "" })).toBe(
        false,
      );
    });
  });

  describe("targetStepId — step-scoped lookup", () => {
    const values: StepScopedValues = {
      "step-1": { nationality: "JM" },
      "step-2": { nationality: "US" }, // same fieldId in a different step
    };
    const flatValues = flattenStepValues(values); // last write wins: nationality = "US"

    it("uses the step-scoped value when targetStepId is provided", () => {
      const behaviour: FieldConditionalOnBehaviour = {
        type: "fieldConditionalOn",
        targetFieldId: "nationality",
        targetStepId: "step-1",
        operator: "equal",
        value: "JM",
      };
      expect(evaluateCondition(behaviour, values, flatValues)).toBe(true);
    });

    it("uses the other step's value when targetStepId differs", () => {
      const behaviour: FieldConditionalOnBehaviour = {
        type: "fieldConditionalOn",
        targetFieldId: "nationality",
        targetStepId: "step-2",
        operator: "equal",
        value: "JM",
      };
      expect(evaluateCondition(behaviour, values, flatValues)).toBe(false);
    });

    it("falls back to flat lookup when targetStepId is absent", () => {
      const behaviour: FieldConditionalOnBehaviour = {
        type: "fieldConditionalOn",
        targetFieldId: "nationality",
        operator: "equal",
        value: "US", // flat lookup yields "US" (last write)
      };
      expect(evaluateCondition(behaviour, values, flatValues)).toBe(true);
    });

    it("returns undefined when targetStepId points to a missing step", () => {
      const behaviour: FieldConditionalOnBehaviour = {
        type: "fieldConditionalOn",
        targetFieldId: "nationality",
        targetStepId: "step-99",
        operator: "exists",
        value: "",
      };
      expect(evaluateCondition(behaviour, values, flatValues)).toBe(false);
    });
  });
});

// ─── evaluateFormConditions ─────────────────────────────────────────────────

describe("evaluateFormConditions", () => {
  describe("no conditional behaviours", () => {
    it("marks all steps and fields as active, scoped to their step", () => {
      const contract = makeContract([
        { stepId: "step-1", fieldIds: ["first-name", "last-name"] },
        { stepId: "step-2", fieldIds: ["email"] },
      ]);
      const values: StepScopedValues = {
        "step-1": { "first-name": "Marcus", "last-name": "Campbell" },
        "step-2": { email: "marcus@example.com" },
      };

      const result = evaluateFormConditions(contract, values);

      expect(result.activeStepIds).toEqual(new Set(["step-1", "step-2"]));
      expect(result.hiddenStepIds.size).toBe(0);
      expect(result.activeFieldIds.get("step-1")).toEqual(
        new Set(["first-name", "last-name"]),
      );
      expect(result.activeFieldIds.get("step-2")).toEqual(new Set(["email"]));
      expect(result.hiddenFieldIds.size).toBe(0);
    });
  });

  describe("step-level conditions", () => {
    it("hides a step when its stepConditionalOn evaluates false", () => {
      const contract = makeContract([
        { stepId: "personal-info", fieldIds: ["nationality"] },
        {
          stepId: "employment-info",
          fieldIds: ["employer-name"],
          behaviours: [
            {
              type: "stepConditionalOn",
              targetFieldId: "nationality",
              targetStepId: "personal-info",
              operator: "equal",
              value: "JM",
            },
          ],
        },
      ]);
      const values: StepScopedValues = {
        "personal-info": { nationality: "US" },
        "employment-info": { "employer-name": "ACME" },
      };

      const result = evaluateFormConditions(contract, values);

      expect(result.hiddenStepIds).toContain("employment-info");
      expect(result.activeStepIds).toContain("personal-info");
      expect(result.hiddenFieldIds.get("employment-info")).toEqual(
        new Set(["employer-name"]),
      );
    });

    it("shows a step when its stepConditionalOn evaluates true", () => {
      const contract = makeContract([
        { stepId: "personal-info", fieldIds: ["nationality"] },
        {
          stepId: "employment-info",
          fieldIds: ["employer-name"],
          behaviours: [
            {
              type: "stepConditionalOn",
              targetFieldId: "nationality",
              targetStepId: "personal-info",
              operator: "equal",
              value: "JM",
            },
          ],
        },
      ]);
      const values: StepScopedValues = {
        "personal-info": { nationality: "JM" },
        "employment-info": { "employer-name": "Ministry" },
      };

      const result = evaluateFormConditions(contract, values);

      expect(result.activeStepIds).toContain("employment-info");
      expect(result.hiddenStepIds.size).toBe(0);
      expect(isActive(result, "employment-info", "employer-name")).toBe(true);
    });

    it("hides all fields in a hidden step regardless of their own behaviours", () => {
      const contract = makeContract([
        { stepId: "step-1", fieldIds: ["toggle"] },
        {
          stepId: "step-2",
          fieldIds: ["field-a", "field-b"],
          behaviours: [
            {
              type: "stepConditionalOn",
              targetFieldId: "toggle",
              operator: "equal",
              value: "yes",
              targetStepId: "step-1",
            },
          ],
          fieldBehaviours: {
            "field-a": [
              {
                type: "fieldConditionalOn",
                targetFieldId: "toggle",
                operator: "exists",
                value: "",
              },
            ],
          },
        },
      ]);
      const values: StepScopedValues = {
        "step-1": { toggle: "no" },
        "step-2": {},
      };

      const result = evaluateFormConditions(contract, values);

      expect(isHidden(result, "step-2", "field-a")).toBe(true);
      expect(isHidden(result, "step-2", "field-b")).toBe(true);
      expect(isActive(result, "step-2", "field-a")).toBe(false);
    });
  });

  describe("field-level conditions", () => {
    it("hides a field when its fieldConditionalOn evaluates false", () => {
      const contract = makeContract([
        { stepId: "step-1", fieldIds: ["contract-type"] },
        {
          stepId: "step-2",
          fieldIds: ["job-title"],
          fieldBehaviours: {
            "job-title": [
              {
                type: "fieldConditionalOn",
                targetFieldId: "contract-type",
                targetStepId: "step-1",
                operator: "equal",
                value: "permanent",
              },
            ],
          },
        },
      ]);
      const values: StepScopedValues = {
        "step-1": { "contract-type": "temporary" },
        "step-2": { "job-title": "Senior Analyst" },
      };

      const result = evaluateFormConditions(contract, values);

      expect(isHidden(result, "step-2", "job-title")).toBe(true);
      expect(isActive(result, "step-2", "job-title")).toBe(false);
    });

    it("keeps a field active when its fieldConditionalOn evaluates true", () => {
      const contract = makeContract([
        { stepId: "step-1", fieldIds: ["contract-type"] },
        {
          stepId: "step-2",
          fieldIds: ["job-title"],
          fieldBehaviours: {
            "job-title": [
              {
                type: "fieldConditionalOn",
                targetFieldId: "contract-type",
                targetStepId: "step-1",
                operator: "equal",
                value: "permanent",
              },
            ],
          },
        },
      ]);
      const values: StepScopedValues = {
        "step-1": { "contract-type": "permanent" },
        "step-2": { "job-title": "Senior Analyst" },
      };

      const result = evaluateFormConditions(contract, values);

      expect(isActive(result, "step-2", "job-title")).toBe(true);
      expect(isHidden(result, "step-2", "job-title")).toBe(false);
    });
  });

  describe("AND semantics", () => {
    it("hides a field when any one of multiple fieldConditionalOn behaviours is false", () => {
      const contract = makeContract([
        { stepId: "step-1", fieldIds: ["type", "status"] },
        {
          stepId: "step-2",
          fieldIds: ["bonus"],
          fieldBehaviours: {
            bonus: [
              {
                type: "fieldConditionalOn",
                targetFieldId: "type",
                targetStepId: "step-1",
                operator: "equal",
                value: "permanent",
              },
              {
                type: "fieldConditionalOn",
                targetFieldId: "status",
                targetStepId: "step-1",
                operator: "equal",
                value: "senior",
              },
            ],
          },
        },
      ]);

      const values: StepScopedValues = {
        "step-1": { type: "permanent", status: "junior" },
        "step-2": {},
      };

      const result = evaluateFormConditions(contract, values);
      expect(isHidden(result, "step-2", "bonus")).toBe(true);
    });

    it("shows a field only when all fieldConditionalOn behaviours are true", () => {
      const contract = makeContract([
        { stepId: "step-1", fieldIds: ["type", "status"] },
        {
          stepId: "step-2",
          fieldIds: ["bonus"],
          fieldBehaviours: {
            bonus: [
              {
                type: "fieldConditionalOn",
                targetFieldId: "type",
                targetStepId: "step-1",
                operator: "equal",
                value: "permanent",
              },
              {
                type: "fieldConditionalOn",
                targetFieldId: "status",
                targetStepId: "step-1",
                operator: "equal",
                value: "senior",
              },
            ],
          },
        },
      ]);

      const values: StepScopedValues = {
        "step-1": { type: "permanent", status: "senior" },
        "step-2": {},
      };

      const result = evaluateFormConditions(contract, values);
      expect(isActive(result, "step-2", "bonus")).toBe(true);
    });
  });

  describe("step-scoped targetStepId in full form evaluation", () => {
    it("resolves targetFieldId from the correct step when same fieldId exists in multiple steps", () => {
      const contract = makeContract([
        { stepId: "applicant", fieldIds: ["first-name"] },
        { stepId: "emergency", fieldIds: ["first-name"] },
        {
          stepId: "confirmation",
          fieldIds: ["show-section"],
          fieldBehaviours: {
            "show-section": [
              {
                type: "fieldConditionalOn",
                targetFieldId: "first-name",
                targetStepId: "applicant",
                operator: "equal",
                value: "Marcus",
              },
            ],
          },
        },
      ]);

      const values: StepScopedValues = {
        applicant: { "first-name": "Marcus" },
        emergency: { "first-name": "Diane" },
        confirmation: {},
      };

      const result = evaluateFormConditions(contract, values);

      expect(isActive(result, "confirmation", "show-section")).toBe(true);
    });
  });
});
