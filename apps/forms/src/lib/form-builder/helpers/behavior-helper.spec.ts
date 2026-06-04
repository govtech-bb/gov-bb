/**
 * behavior-helper.spec.ts
 *
 * Unit tests for the behavior helper functions.
 *
 * Coverage:
 *  - checkConditionalOn: empty conditions, passesCondition paths, currentFieldValue branches
 *  - getVisibleSteps: no behaviours, step visible, step hidden
 *  - getStepConditonalTargets: no behaviours, mixed steps, multiple behaviours
 */

import {
  checkConditionalOn,
  getVisibleSteps,
  getVisibleFields,
  getStepConditonalTargets,
} from "./behavior-helper";
import type { ClientFormStep, ClientPrimitive } from "@forms/types";
import type {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import type { AnyFormApi } from "@tanstack/react-form";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeFormApi(fieldValues: Record<string, unknown> = {}): AnyFormApi {
  return {
    // checkConditionalOn now reads the full composite-keyed value map from
    // `state.values` and builds the shared evaluator's step-scoped tree from it.
    state: { values: fieldValues },
    getFieldValue: (fieldId: string) => fieldValues[fieldId],
  } as unknown as AnyFormApi;
}

function makeStep(
  stepId: string,
  behaviours?: ClientFormStep["behaviours"],
): ClientFormStep {
  return {
    stepId,
    title: `Step ${stepId}`,
    fields: [],
    behaviours,
  };
}

// ---------------------------------------------------------------------------
// checkConditionalOn
// ---------------------------------------------------------------------------

describe("checkConditionalOn", () => {
  it("returns 'unknownState' when conditionalOns array is empty", () => {
    const formApi = makeFormApi();
    const result = checkConditionalOn("", [], formApi);
    expect(result).toBe("unknownState");
  });

  it("returns 'notRequired' when no condition passes", () => {
    const formApi = makeFormApi({ step1_colour: "blue" });
    const condition: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetStepId: "step1",
      targetFieldId: "colour",
      operator: "equal",
      value: "red",
    };
    const result = checkConditionalOn("", [condition], formApi);
    expect(result).toBe("notRequired");
  });

  it("returns 'requiredAndEmpty' when condition passes and currentFieldValue is empty", () => {
    const formApi = makeFormApi({ step1_colour: "red" });
    const condition: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetStepId: "step1",
      targetFieldId: "colour",
      operator: "equal",
      value: "red",
    };
    const result = checkConditionalOn("", [condition], formApi);
    expect(result).toBe("requiredAndEmpty");
  });

  it("returns 'notEmpty' when condition passes and currentFieldValue is non-empty", () => {
    const formApi = makeFormApi({ step1_colour: "red" });
    const condition: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetStepId: "step1",
      targetFieldId: "colour",
      operator: "equal",
      value: "red",
    };
    const result = checkConditionalOn("John", [condition], formApi);
    expect(result).toBe("notEmpty");
  });

  it("uses fieldStep as targetStepId when condition.targetStepId is absent", () => {
    // The condition has no targetStepId; fieldStep is passed as fallback
    const formApi = makeFormApi({ step1_colour: "red" });
    const condition = {
      type: "fieldConditionalOn" as const,
      targetFieldId: "colour",
      operator: "equal" as const,
      value: "red",
    };
    const result = checkConditionalOn("", [condition], formApi, "step1");
    expect(result).toBe("requiredAndEmpty");
  });

  it("does NOT match a mixed-case value against a lowercase condition (cross-path agreement with the API)", () => {
    // Regression for #668: the retired local evaluator's `equal` was
    // case-insensitive, so "No" matched `value: "no"` and the field was treated
    // as required — but the case-sensitive API then 422'd the accepted input.
    // The shared evaluator is case-sensitive, so the condition does NOT pass and
    // the client now agrees with the API.
    const formApi = makeFormApi({ step1_hasJob: "No" });
    const condition: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetStepId: "step1",
      targetFieldId: "hasJob",
      operator: "equal",
      value: "no",
    };
    const result = checkConditionalOn("", [condition], formApi);
    expect(result).toBe("notRequired");
  });

  it("treats null-ish currentFieldValue as empty string before length check", () => {
    const formApi = makeFormApi({ step1_colour: "red" });
    const condition: FieldConditionalOnBehaviour = {
      type: "fieldConditionalOn",
      targetStepId: "step1",
      targetFieldId: "colour",
      operator: "equal",
      value: "red",
    };
    // null-ish currentFieldValue → gets coerced to "" before toString
    const result = checkConditionalOn(null as never, [condition], formApi);
    expect(result).toBe("requiredAndEmpty");
  });
});

// ---------------------------------------------------------------------------
// getVisibleSteps
// ---------------------------------------------------------------------------

describe("getVisibleSteps", () => {
  it("includes a step that has no behaviours", () => {
    const steps = [makeStep("step1")];
    const formApi = makeFormApi();
    const visible = getVisibleSteps(steps, formApi);
    expect(visible).toHaveLength(1);
    expect(visible[0].stepId).toBe("step1");
  });

  it("includes a step that has behaviours but none of type stepConditionalOn", () => {
    const steps = [
      makeStep("step1", [
        {
          type: "repeatable",
          min: 1,
          max: 3,
        },
      ]),
    ];
    const formApi = makeFormApi();
    const visible = getVisibleSteps(steps, formApi);
    expect(visible).toHaveLength(1);
  });

  it("shows a step when the stepConditionalOn condition is met", () => {
    const stepBehaviour: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetStepId: "step0",
      targetFieldId: "hasVisit",
      operator: "equal",
      value: "yes",
    };
    const steps = [makeStep("step1", [stepBehaviour])];
    const formApi = makeFormApi({ step0_hasVisit: "yes" });
    const visible = getVisibleSteps(steps, formApi);
    // condition passes → requiredAndEmpty (since currentFieldValue is "") → not "notRequired" → visible
    expect(visible).toHaveLength(1);
  });

  it("hides a step when the stepConditionalOn condition is NOT met", () => {
    const stepBehaviour: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetStepId: "step0",
      targetFieldId: "hasVisit",
      operator: "equal",
      value: "yes",
    };
    const steps = [makeStep("step1", [stepBehaviour])];
    const formApi = makeFormApi({ step0_hasVisit: "no" });
    const visible = getVisibleSteps(steps, formApi);
    expect(visible).toHaveLength(0);
  });

  it("filters correctly across multiple steps", () => {
    const behaviour: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetStepId: "step0",
      targetFieldId: "hasVisit",
      operator: "equal",
      value: "yes",
    };
    const steps = [
      makeStep("step0"),
      makeStep("step1", [behaviour]),
      makeStep("step2"),
    ];
    const formApi = makeFormApi({ step0_hasVisit: "no" });
    const visible = getVisibleSteps(steps, formApi);
    // step0 and step2 visible; step1 hidden
    expect(visible.map((s) => s.stepId)).toEqual(["step0", "step2"]);
  });
});

// ---------------------------------------------------------------------------
// getVisibleFields
// ---------------------------------------------------------------------------

function makeField(
  stepId: string,
  fieldId: string,
  overrides: Partial<ClientPrimitive> = {},
): ClientPrimitive {
  return {
    id: `${stepId}_${fieldId}`,
    fieldId,
    stepId,
    name: fieldId,
    label: `Field ${fieldId}`,
    htmlType: "text",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
    ...overrides,
  };
}

describe("getVisibleFields", () => {
  const conditionalOn = (
    overrides: Partial<FieldConditionalOnBehaviour> = {},
  ): FieldConditionalOnBehaviour => ({
    type: "fieldConditionalOn",
    targetStepId: "step1",
    targetFieldId: "hasJob",
    operator: "equal",
    value: "yes",
    ...overrides,
  });

  it("includes a field with no behaviours", () => {
    const step = makeStep("step1");
    step.fields = [makeField("step1", "name")];
    const visible = getVisibleFields(step, makeFormApi());
    expect(visible.map((f) => f.fieldId)).toEqual(["name"]);
  });

  it("excludes a field with hidden: true", () => {
    const step = makeStep("step1");
    step.fields = [makeField("step1", "secret", { hidden: true })];
    const visible = getVisibleFields(step, makeFormApi());
    expect(visible).toHaveLength(0);
  });

  it("includes a conditional field when its 'equal' condition passes", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "hasJob"),
      makeField("step1", "employer", { behaviours: [conditionalOn()] }),
    ];
    const formApi = makeFormApi({ step1_hasJob: "yes" });
    const visible = getVisibleFields(step, formApi);
    expect(visible.map((f) => f.fieldId)).toEqual(["hasJob", "employer"]);
  });

  it("excludes a conditional field when its 'equal' condition fails — even if the stale flag says visible (#737)", () => {
    const step = makeStep("step1");
    const employer = makeField("step1", "employer", {
      behaviours: [conditionalOn()],
      // The render-time flag was never updated because the field never
      // mounted after the controlling answer flipped — the #737 bug.
      conditionallyHidden: false,
    });
    step.fields = [makeField("step1", "hasJob"), employer];
    const formApi = makeFormApi({
      step1_hasJob: "no",
      step1_employer: "Acme Ltd", // stale answer kept in state (keep-but-hide)
    });
    const visible = getVisibleFields(step, formApi);
    expect(visible.map((f) => f.fieldId)).toEqual(["hasJob"]);
  });

  it("ignores the conditionallyHidden flag when the condition passes", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "employer", {
        behaviours: [conditionalOn()],
        conditionallyHidden: true, // stale flag from a previous render
      }),
    ];
    const formApi = makeFormApi({ step1_hasJob: "yes" });
    const visible = getVisibleFields(step, formApi);
    expect(visible.map((f) => f.fieldId)).toEqual(["employer"]);
  });

  it("defaults targetStepId to the field's own step when absent", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "employer", {
        behaviours: [conditionalOn({ targetStepId: undefined })],
      }),
    ];
    const visibleWhenYes = getVisibleFields(
      step,
      makeFormApi({ step1_hasJob: "yes" }),
    );
    const visibleWhenNo = getVisibleFields(
      step,
      makeFormApi({ step1_hasJob: "no" }),
    );
    expect(visibleWhenYes).toHaveLength(1);
    expect(visibleWhenNo).toHaveLength(0);
  });

  it("evaluates 'notEqual' conditions", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "details", {
        behaviours: [conditionalOn({ operator: "notEqual", value: "none" })],
      }),
    ];
    expect(
      getVisibleFields(step, makeFormApi({ step1_hasJob: "none" })),
    ).toHaveLength(0);
    expect(
      getVisibleFields(step, makeFormApi({ step1_hasJob: "part-time" })),
    ).toHaveLength(1);
  });

  it("evaluates 'in' conditions", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "details", {
        behaviours: [
          conditionalOn({ operator: "in", value: ["full-time", "part-time"] }),
        ],
      }),
    ];
    expect(
      getVisibleFields(step, makeFormApi({ step1_hasJob: "part-time" })),
    ).toHaveLength(1);
    expect(
      getVisibleFields(step, makeFormApi({ step1_hasJob: "retired" })),
    ).toHaveLength(0);
  });

  it("evaluates 'exists' conditions", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "details", {
        behaviours: [conditionalOn({ operator: "exists", value: "" })],
      }),
    ];
    expect(
      getVisibleFields(step, makeFormApi({ step1_hasJob: "anything" })),
    ).toHaveLength(1);
    expect(getVisibleFields(step, makeFormApi({}))).toHaveLength(0);
  });

  it("keeps a field visible when its condition passes but the field itself is empty (requiredAndEmpty)", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "employer", { behaviours: [conditionalOn()] }),
    ];
    // hasJob = yes reveals employer; the user hasn't typed anything yet —
    // the field is required-and-empty, which is still visible.
    const formApi = makeFormApi({ step1_hasJob: "yes" });
    expect(getVisibleFields(step, formApi)).toHaveLength(1);
  });

  it("treats multiple fieldConditionalOn behaviours as OR — visible when any one passes", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "details", {
        behaviours: [
          conditionalOn({ targetFieldId: "hasJob", value: "yes" }),
          conditionalOn({ targetFieldId: "hadJobBefore", value: "yes" }),
        ],
      }),
    ];
    // Second condition passes, first fails → visible.
    expect(
      getVisibleFields(
        step,
        makeFormApi({ step1_hasJob: "no", step1_hadJobBefore: "yes" }),
      ),
    ).toHaveLength(1);
    // Neither passes → hidden.
    expect(
      getVisibleFields(
        step,
        makeFormApi({ step1_hasJob: "no", step1_hadJobBefore: "no" }),
      ),
    ).toHaveLength(0);
  });

  it("ignores non-conditional behaviours (e.g. fieldArray)", () => {
    const step = makeStep("step1");
    step.fields = [
      makeField("step1", "items", {
        behaviours: [{ type: "fieldArray", addAnotherLabel: "Add" } as never],
      }),
    ];
    expect(getVisibleFields(step, makeFormApi())).toHaveLength(1);
  });

  it("keeps flag-based behaviour for repeatable steps (per-instance visibility is out of scope)", () => {
    const step = makeStep("step1", [{ type: "repeatable", min: 1, max: 3 }]);
    step.fields = [
      // Condition fails, but on a repeatable step the render-time flag stays
      // authoritative — per-instance semantics live in form-conditions.
      makeField("step1", "employer", {
        behaviours: [conditionalOn()],
        conditionallyHidden: false,
      }),
      makeField("step1", "occupation", { conditionallyHidden: true }),
      makeField("step1", "secret", { hidden: true }),
    ];
    const formApi = makeFormApi({ step1_hasJob: "no" });
    const visible = getVisibleFields(step, formApi);
    expect(visible.map((f) => f.fieldId)).toEqual(["employer"]);
  });
});

// ---------------------------------------------------------------------------
// getStepConditonalTargets
// ---------------------------------------------------------------------------

describe("getStepConditonalTargets", () => {
  it("returns an empty object when no steps have behaviours", () => {
    const steps = [makeStep("step1"), makeStep("step2")];
    const targets = getStepConditonalTargets(steps);
    expect(targets).toEqual({});
  });

  it("returns an empty object when steps have behaviours but no stepConditionalOn", () => {
    const steps = [makeStep("step1", [{ type: "repeatable", min: 1, max: 3 }])];
    const targets = getStepConditonalTargets(steps);
    expect(targets).toEqual({});
  });

  it("maps targetStepId -> targetFieldId for a single stepConditionalOn", () => {
    const behaviour: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetStepId: "step0",
      targetFieldId: "colour",
      operator: "equal",
      value: "red",
    };
    const steps = [makeStep("step1", [behaviour])];
    const targets = getStepConditonalTargets(steps);
    expect(targets).toEqual({ step0: "colour" });
  });

  it("uses 'temporary' as key when targetStepId is absent on StepConditionalOnBehaviour", () => {
    // StepConditionalOnBehaviour requires targetStepId by schema, but the runtime
    // code uses `?? "temporary"` as a fallback, so we test that path with a cast.
    const behaviour = {
      type: "stepConditionalOn" as const,
      targetFieldId: "colour",
      operator: "equal" as const,
      value: "red",
    } as unknown as StepConditionalOnBehaviour;

    const steps = [makeStep("step1", [behaviour])];
    const targets = getStepConditonalTargets(steps);
    expect(targets).toEqual({ temporary: "colour" });
  });

  it("collects targets from multiple steps", () => {
    const b1: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetStepId: "step0",
      targetFieldId: "fieldA",
      operator: "equal",
      value: "yes",
    };
    const b2: StepConditionalOnBehaviour = {
      type: "stepConditionalOn",
      targetStepId: "step1",
      targetFieldId: "fieldB",
      operator: "equal",
      value: "yes",
    };
    const steps = [makeStep("step2", [b1]), makeStep("step3", [b2])];
    const targets = getStepConditonalTargets(steps);
    expect(targets).toEqual({ step0: "fieldA", step1: "fieldB" });
  });
});
