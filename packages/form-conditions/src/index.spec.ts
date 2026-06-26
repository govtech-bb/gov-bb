import { evaluateFormConditions, resolveStepTitle } from "./index";
import { evaluateCondition, flattenStepValues } from "./internals";
// Also import via the package entry to exercise the public re-exports (#668):
// `apps/forms` consumes these low-level primitives directly from the package.
import {
  evaluateCondition as evaluateConditionFromIndex,
  flattenStepValues as flattenStepValuesFromIndex,
} from "./index";
import type { ConditionResult, StepScopedValues } from "./index";
import type {
  FieldConditionalOnBehaviour,
  OptionalIfBehaviour,
  StepConditionalOnBehaviour,
  ServiceContract,
  ServiceContract as SC,
  Primitive,
  RepeatableBehaviour,
} from "@govtech-bb/form-types";

type FieldBehaviour = FieldConditionalOnBehaviour | OptionalIfBehaviour;

// ─── helpers ───────────────────────────────────────────────────────────────

function makePrimitive(
  fieldId: string,
  behaviours?: FieldBehaviour[],
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
    fieldBehaviours?: Record<string, FieldBehaviour[]>;
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

const isOptional = (
  result: ConditionResult,
  stepId: string,
  fieldId: string,
  instance = 0,
) =>
  result.optionalFieldsByInstance.get(stepId)?.[instance]?.has(fieldId) ??
  false;

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

    it("matches a numeric condition value against a string target (#336)", () => {
      const numeric: FieldConditionalOnBehaviour = {
        type: "fieldConditionalOn",
        targetFieldId: "age",
        operator: "equal",
        value: 18 as unknown as string,
      };
      expect(evaluateCondition(numeric, EMPTY_VALUES, { age: "18" })).toBe(
        true,
      );
      expect(evaluateCondition(numeric, EMPTY_VALUES, { age: "19" })).toBe(
        false,
      );
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

    it("matches a numeric list entry against a string target (#336)", () => {
      const numeric: FieldConditionalOnBehaviour = {
        type: "fieldConditionalOn",
        targetFieldId: "dependants",
        operator: "in",
        value: [1, 2, 3] as unknown as string[],
      };
      expect(
        evaluateCondition(numeric, EMPTY_VALUES, { dependants: "2" }),
      ).toBe(true);
      expect(
        evaluateCondition(numeric, EMPTY_VALUES, { dependants: "4" }),
      ).toBe(false);
    });

    // ─── multi-select checkbox (array-valued) targets (#1709) ────────────────
    // A multi-select checkbox stores its value as a string[] of selected
    // options. `in` should match when ANY selected option is in the list.
    const multiSelect: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetFieldId: "contact-methods",
      operator: "in",
      value: ["email"],
    };

    it("matches when 2+ ticked and one is in the list (#1709 regression)", () => {
      expect(
        evaluateCondition(multiSelect, EMPTY_VALUES, {
          "contact-methods": ["email", "sms"],
        }),
      ).toBe(true);
    });

    it("matches a single-element array selection", () => {
      expect(
        evaluateCondition(multiSelect, EMPTY_VALUES, {
          "contact-methods": ["email"],
        }),
      ).toBe(true);
    });

    it("does not match when no selected option is in the list", () => {
      expect(
        evaluateCondition(multiSelect, EMPTY_VALUES, {
          "contact-methods": ["sms", "phone"],
        }),
      ).toBe(false);
    });

    it("does not match an empty selection", () => {
      expect(
        evaluateCondition(multiSelect, EMPTY_VALUES, {
          "contact-methods": [],
        }),
      ).toBe(false);
    });

    it("matches a string array element against a numeric list entry (#336)", () => {
      const numeric: FieldConditionalOnBehaviour = {
        type: "fieldConditionalOn",
        targetFieldId: "dependant-counts",
        operator: "in",
        value: [1, 2, 3] as unknown as string[],
      };
      expect(
        evaluateCondition(numeric, EMPTY_VALUES, {
          "dependant-counts": ["2", "5"],
        }),
      ).toBe(true);
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

    it("returns false for an empty array (#337)", () => {
      expect(evaluateCondition(behaviour, EMPTY_VALUES, { employer: [] })).toBe(
        false,
      );
    });

    it("returns true for a non-empty array (#337)", () => {
      expect(
        evaluateCondition(behaviour, EMPTY_VALUES, { employer: ["a"] }),
      ).toBe(true);
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

// ─── Instance-aware evaluation (NEW) ────────────────────────────────────────

describe("evaluateFormConditions — repeatable steps", () => {
  function repeatableStep(
    stepId: string,
    fieldIds: string[],
    fieldBehaviours?: Record<string, FieldConditionalOnBehaviour[]>,
  ) {
    return {
      stepId,
      title: stepId,
      behaviours: [
        { type: "repeatable", min: 0, max: 5 } as RepeatableBehaviour,
      ],
      elements: fieldIds.map((id) => ({
        fieldId: id,
        label: id,
        htmlType: "text",
        behaviours: fieldBehaviours?.[id],
      })) as SC["steps"][number]["elements"],
    };
  }

  it("resolves fieldConditionalOn instance-locally inside a repeatable step", () => {
    const contract: SC = {
      formId: "f",
      title: "F",
      version: "1",
      createdAt: "",
      updatedAt: "",
      steps: [
        repeatableStep("jobs", ["has-job", "employer"], {
          employer: [
            {
              type: "fieldConditionalOn",
              targetFieldId: "has-job",
              operator: "equal",
              value: "yes",
            },
          ],
        }),
      ],
    } as SC;

    const values = {
      jobs: [{ "has-job": "yes" }, { "has-job": "no" }],
    };

    const result = evaluateFormConditions(contract, values);

    expect(result.activeFieldsByInstance?.get("jobs")?.[0]).toEqual(
      new Set(["has-job", "employer"]),
    );
    expect(result.activeFieldsByInstance?.get("jobs")?.[1]).toEqual(
      new Set(["has-job"]),
    );
    expect(result.hiddenFieldsByInstance?.get("jobs")?.[1]).toEqual(
      new Set(["employer"]),
    );
  });

  it("hides the entire repeatable step when stepConditionalOn evaluates false", () => {
    const contract: SC = {
      formId: "f",
      title: "F",
      version: "1",
      createdAt: "",
      updatedAt: "",
      steps: [
        {
          stepId: "gate",
          title: "g",
          behaviours: [],
          elements: [
            { fieldId: "wants-jobs", label: "x", htmlType: "text" },
          ] as SC["steps"][number]["elements"],
        },
        {
          stepId: "jobs",
          title: "j",
          behaviours: [
            { type: "repeatable", min: 1, max: 3 } as RepeatableBehaviour,
            {
              type: "stepConditionalOn",
              targetFieldId: "wants-jobs",
              targetStepId: "gate",
              operator: "equal",
              value: "yes",
            },
          ],
          elements: [
            { fieldId: "employer", label: "x", htmlType: "text" },
          ] as SC["steps"][number]["elements"],
        },
      ],
    } as SC;

    const values = {
      gate: { "wants-jobs": "no" },
      jobs: [{ employer: "ACME" }],
    };

    const result = evaluateFormConditions(contract, values);

    expect(result.hiddenStepIds.has("jobs")).toBe(true);
    expect(result.activeFieldsByInstance?.get("jobs")).toBeUndefined();
  });

  it("treats primitive.isHidden=true as permanently hidden (BUG FIX)", () => {
    const contract: SC = {
      formId: "f",
      title: "F",
      version: "1",
      createdAt: "",
      updatedAt: "",
      steps: [
        {
          stepId: "s",
          title: "s",
          behaviours: [],
          elements: [
            { fieldId: "visible", label: "v", htmlType: "text" },
            {
              fieldId: "hidden-prim",
              label: "h",
              htmlType: "text",
              isHidden: true,
            },
          ] as SC["steps"][number]["elements"],
        },
      ],
    } as SC;

    const result = evaluateFormConditions(contract, {
      s: { visible: "x", "hidden-prim": "y" },
    });

    expect(result.activeFieldIds.get("s")).toEqual(new Set(["visible"]));
    expect(result.hiddenFieldIds.get("s")).toEqual(new Set(["hidden-prim"]));
  });
});

// ─── optionalIf — relaxes required without hiding ───────────────────────────

describe("evaluateFormConditions — optionalIf", () => {
  const optionalIfStep = (
    fieldId: string,
    behaviour: OptionalIfBehaviour,
  ): Parameters<typeof makeContract>[0] => [
    { stepId: "gate", fieldIds: ["trigger"] },
    {
      stepId: "details",
      fieldIds: [fieldId],
      fieldBehaviours: { [fieldId]: [behaviour] },
    },
  ];

  it("flags a field as optional when its optionalIf matches (equal)", () => {
    const contract = makeContract(
      optionalIfStep("middle-name", {
        type: "optionalIf",
        targetFieldId: "trigger",
        targetStepId: "gate",
        operator: "equal",
        value: "skip",
      }),
    );
    const values: StepScopedValues = {
      gate: { trigger: "skip" },
      details: { "middle-name": "" },
    };

    const result = evaluateFormConditions(contract, values);

    expect(isOptional(result, "details", "middle-name")).toBe(true);
    // never hidden — stays active
    expect(isActive(result, "details", "middle-name")).toBe(true);
    expect(isHidden(result, "details", "middle-name")).toBe(false);
  });

  it("does not flag the field when the optionalIf does not match", () => {
    const contract = makeContract(
      optionalIfStep("middle-name", {
        type: "optionalIf",
        targetFieldId: "trigger",
        targetStepId: "gate",
        operator: "equal",
        value: "skip",
      }),
    );
    const values: StepScopedValues = {
      gate: { trigger: "no" },
      details: { "middle-name": "" },
    };

    const result = evaluateFormConditions(contract, values);

    expect(isOptional(result, "details", "middle-name")).toBe(false);
    expect(isActive(result, "details", "middle-name")).toBe(true);
  });

  it("honours the notEqual operator", () => {
    const contract = makeContract(
      optionalIfStep("field", {
        type: "optionalIf",
        targetFieldId: "trigger",
        targetStepId: "gate",
        operator: "notEqual",
        value: "required",
      }),
    );
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { trigger: "other" } }),
        "details",
        "field",
      ),
    ).toBe(true);
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { trigger: "required" } }),
        "details",
        "field",
      ),
    ).toBe(false);
  });

  it("honours the in operator", () => {
    const contract = makeContract(
      optionalIfStep("field", {
        type: "optionalIf",
        targetFieldId: "trigger",
        targetStepId: "gate",
        operator: "in",
        value: ["a", "b"],
      }),
    );
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { trigger: "b" } }),
        "details",
        "field",
      ),
    ).toBe(true);
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { trigger: "c" } }),
        "details",
        "field",
      ),
    ).toBe(false);
  });

  it("honours the exists operator", () => {
    const contract = makeContract(
      optionalIfStep("field", {
        type: "optionalIf",
        targetFieldId: "trigger",
        targetStepId: "gate",
        operator: "exists",
        value: "",
      }),
    );
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { trigger: "anything" } }),
        "details",
        "field",
      ),
    ).toBe(true);
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { trigger: "" } }),
        "details",
        "field",
      ),
    ).toBe(false);
  });

  it("AND semantics — optional only when every optionalIf matches", () => {
    const contract = makeContract([
      { stepId: "gate", fieldIds: ["a", "b"] },
      {
        stepId: "details",
        fieldIds: ["field"],
        fieldBehaviours: {
          field: [
            {
              type: "optionalIf",
              targetFieldId: "a",
              targetStepId: "gate",
              operator: "equal",
              value: "yes",
            },
            {
              type: "optionalIf",
              targetFieldId: "b",
              targetStepId: "gate",
              operator: "equal",
              value: "yes",
            },
          ],
        },
      },
    ]);
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { a: "yes", b: "no" } }),
        "details",
        "field",
      ),
    ).toBe(false);
    expect(
      isOptional(
        evaluateFormConditions(contract, { gate: { a: "yes", b: "yes" } }),
        "details",
        "field",
      ),
    ).toBe(true);
  });

  it("evaluates optionalIf per instance inside a repeatable step", () => {
    const contract: SC = {
      formId: "f",
      title: "F",
      version: "1",
      createdAt: "",
      updatedAt: "",
      steps: [
        {
          stepId: "jobs",
          title: "jobs",
          behaviours: [
            { type: "repeatable", min: 0, max: 5 } as RepeatableBehaviour,
          ],
          elements: [
            { fieldId: "has-end-date", label: "x", htmlType: "text" },
            {
              fieldId: "end-date",
              label: "x",
              htmlType: "text",
              behaviours: [
                {
                  type: "optionalIf",
                  targetFieldId: "has-end-date",
                  operator: "equal",
                  value: "no",
                },
              ] as OptionalIfBehaviour[],
            },
          ] as SC["steps"][number]["elements"],
        },
      ],
    } as SC;

    const values = {
      jobs: [{ "has-end-date": "no" }, { "has-end-date": "yes" }],
    };

    const result = evaluateFormConditions(contract, values);

    expect(isOptional(result, "jobs", "end-date", 0)).toBe(true);
    expect(isOptional(result, "jobs", "end-date", 1)).toBe(false);
    // active in both instances regardless of optional state
    expect(result.activeFieldsByInstance.get("jobs")?.[0]).toContain(
      "end-date",
    );
    expect(result.activeFieldsByInstance.get("jobs")?.[1]).toContain(
      "end-date",
    );
  });

  it("leaves optionalFieldsByInstance empty for a field with no optionalIf", () => {
    const contract = makeContract([{ stepId: "details", fieldIds: ["plain"] }]);
    const result = evaluateFormConditions(contract, {
      details: { plain: "x" },
    });
    expect(isOptional(result, "details", "plain")).toBe(false);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("evaluateFormConditions — edge cases", () => {
  it("returns empty active/hidden sets when steps array is empty", () => {
    const contract = makeContract([]);
    const result = evaluateFormConditions(contract, {});
    expect(result.activeStepIds.size).toBe(0);
    expect(result.hiddenStepIds.size).toBe(0);
    expect(result.activeFieldIds.size).toBe(0);
    expect(result.hiddenFieldIds.size).toBe(0);
  });
});

describe("evaluateCondition — unknown operator", () => {
  it("returns false and does not throw for an unrecognised operator", () => {
    const behaviour = {
      type: "fieldConditionalOn" as const,
      targetFieldId: "x",
      operator: "startsWith" as unknown as "equal",
      value: "foo",
    };
    expect(() =>
      evaluateCondition(behaviour, EMPTY_VALUES, { x: "foobar" }),
    ).not.toThrow();
    expect(evaluateCondition(behaviour, EMPTY_VALUES, { x: "foobar" })).toBe(
      false,
    );
  });
});

// ─── flattenStepValues — must skip arrays (E21) ─────────────────────────────

describe("flattenStepValues — array safety", () => {
  it("skips array-valued (repeatable) step entries", () => {
    const flat = flattenStepValues({
      personal: { name: "Marcus" },
      jobs: [{ employer: "ACME" }],
    } as unknown as StepScopedValues);
    expect(flat).toEqual({ name: "Marcus" });
    expect("employer" in flat).toBe(false);
  });
});

// ─── public re-exports (#668) ───────────────────────────────────────────────
// `apps/forms` evaluates single conditions client-side using these primitives
// imported from the package entry, so the entry must surface them.

describe("package entry re-exports evaluateCondition & flattenStepValues", () => {
  it("re-exports the same evaluateCondition implementation", () => {
    expect(evaluateConditionFromIndex).toBe(evaluateCondition);
    const values: StepScopedValues = { step1: { colour: "red" } };
    const flat = flattenStepValuesFromIndex(values);
    expect(
      evaluateConditionFromIndex(
        {
          type: "fieldConditionalOn",
          targetStepId: "step1",
          targetFieldId: "colour",
          operator: "equal",
          value: "red",
        },
        values,
        flat,
      ),
    ).toBe(true);
  });

  it("re-exports the same flattenStepValues implementation", () => {
    expect(flattenStepValuesFromIndex).toBe(flattenStepValues);
  });
});

// ─── numeric operators + transform (issue #1020) ────────────────────────────

// Build an ISO "YYYY-MM-DD" exactly `years` ago (same month/day), so the
// derived age is deterministic regardless of when the suite runs.
const isoYearsAgo = (years: number): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};

describe("evaluateCondition — numeric operators", () => {
  const make = (
    operator: "gte" | "lte" | "gt" | "lt",
    value: number,
  ): FieldConditionalOnBehaviour =>
    ({
      type: "fieldConditionalOn",
      targetFieldId: "score",
      operator,
      value,
    }) as unknown as FieldConditionalOnBehaviour;

  it("gte: true when target >= value (boundary inclusive)", () => {
    expect(
      evaluateCondition(make("gte", 18), EMPTY_VALUES, { score: "18" }),
    ).toBe(true);
    expect(
      evaluateCondition(make("gte", 18), EMPTY_VALUES, { score: "17" }),
    ).toBe(false);
  });

  it("lte: true when target <= value (boundary inclusive)", () => {
    expect(
      evaluateCondition(make("lte", 24), EMPTY_VALUES, { score: "24" }),
    ).toBe(true);
    expect(
      evaluateCondition(make("lte", 24), EMPTY_VALUES, { score: "25" }),
    ).toBe(false);
  });

  it("gt: strict greater-than", () => {
    expect(
      evaluateCondition(make("gt", 18), EMPTY_VALUES, { score: "19" }),
    ).toBe(true);
    expect(
      evaluateCondition(make("gt", 18), EMPTY_VALUES, { score: "18" }),
    ).toBe(false);
  });

  it("lt: strict less-than", () => {
    expect(
      evaluateCondition(make("lt", 24), EMPTY_VALUES, { score: "23" }),
    ).toBe(true);
    expect(
      evaluateCondition(make("lt", 24), EMPTY_VALUES, { score: "24" }),
    ).toBe(false);
  });

  it("returns false when either side is non-numeric (NaN never matches)", () => {
    expect(
      evaluateCondition(make("gte", 18), EMPTY_VALUES, { score: "abc" }),
    ).toBe(false);
    expect(evaluateCondition(make("gte", 18), EMPTY_VALUES, {})).toBe(false);
  });
});

describe("evaluateCondition — transform (yearsSince/monthsSince/daysSince)", () => {
  const make = (
    operator: "gte" | "lte",
    value: number,
    transform: "yearsSince" | "monthsSince" | "daysSince",
  ): FieldConditionalOnBehaviour =>
    ({
      type: "fieldConditionalOn",
      targetFieldId: "dob",
      operator,
      value,
      transform,
    }) as unknown as FieldConditionalOnBehaviour;

  it("yearsSince: derives age from a DOB before comparing", () => {
    expect(
      evaluateCondition(make("gte", 16, "yearsSince"), EMPTY_VALUES, {
        dob: isoYearsAgo(20),
      }),
    ).toBe(true);
    expect(
      evaluateCondition(make("gte", 16, "yearsSince"), EMPTY_VALUES, {
        dob: isoYearsAgo(10),
      }),
    ).toBe(false);
  });

  it("yearsSince upper bound: lte 24 rejects an older applicant", () => {
    expect(
      evaluateCondition(make("lte", 24, "yearsSince"), EMPTY_VALUES, {
        dob: isoYearsAgo(20),
      }),
    ).toBe(true);
    expect(
      evaluateCondition(make("lte", 24, "yearsSince"), EMPTY_VALUES, {
        dob: isoYearsAgo(30),
      }),
    ).toBe(false);
  });

  it("accepts a { day, month, year } DateValue target", () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 40);
    const value = {
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    };
    expect(
      evaluateCondition(make("gte", 16, "yearsSince"), EMPTY_VALUES, {
        dob: value as unknown as string,
      }),
    ).toBe(true);
  });

  it("an invalid/empty date under transform never matches (NaN)", () => {
    expect(
      evaluateCondition(make("gte", 16, "yearsSince"), EMPTY_VALUES, {
        dob: "",
      }),
    ).toBe(false);
  });

  it("composes an age range through stacked AND conditions (16–24)", () => {
    const lower = make("gte", 16, "yearsSince");
    const upper = make("lte", 24, "yearsSince");
    const inRange = { dob: isoYearsAgo(20) };
    const tooOld = { dob: isoYearsAgo(30) };
    const both = (vals: Record<string, unknown>) =>
      [lower, upper].every((b) => evaluateCondition(b, EMPTY_VALUES, vals));
    expect(both(inRange)).toBe(true);
    expect(both(tooOld)).toBe(false);
  });
});

// ─── resolveStepTitle ────────────────────────────────────────────────────────

describe("resolveStepTitle", () => {
  const step = {
    title: "Provide the person's birth details",
    conditionalTitle: [
      {
        targetFieldId: "applying-for-yourself",
        operator: "equal" as const,
        value: "yes",
        title: "Provide your birth details",
      },
    ],
  };

  it("returns the static title when there is no conditionalTitle", () => {
    expect(resolveStepTitle({ title: "Birth details" }, EMPTY_VALUES)).toBe(
      "Birth details",
    );
  });

  it("returns the static title when the conditionalTitle array is empty", () => {
    expect(
      resolveStepTitle(
        { title: "Birth details", conditionalTitle: [] },
        {
          step: { "applying-for-yourself": "yes" },
        },
      ),
    ).toBe("Birth details");
  });

  it("returns the conditional title when its condition matches", () => {
    expect(
      resolveStepTitle(step, {
        "applying-for-yourself": { "applying-for-yourself": "yes" },
      }),
    ).toBe("Provide your birth details");
  });

  it("falls back to the static title when no condition matches", () => {
    expect(
      resolveStepTitle(step, {
        "applying-for-yourself": { "applying-for-yourself": "no" },
      }),
    ).toBe("Provide the person's birth details");
  });

  it("falls back to the static title when the watched field is absent", () => {
    expect(resolveStepTitle(step, EMPTY_VALUES)).toBe(
      "Provide the person's birth details",
    );
  });

  it("returns the first matching entry's title (first match wins)", () => {
    const multi = {
      title: "Default",
      conditionalTitle: [
        {
          targetFieldId: "kind",
          operator: "equal" as const,
          value: "a",
          title: "Title A",
        },
        {
          targetFieldId: "kind",
          operator: "equal" as const,
          value: "b",
          title: "Title B",
        },
      ],
    };
    expect(resolveStepTitle(multi, { s: { kind: "b" } })).toBe("Title B");
    expect(resolveStepTitle(multi, { s: { kind: "a" } })).toBe("Title A");
  });
});
