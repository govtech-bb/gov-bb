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
  getStepConditonalTargets,
} from "./behavior-helper";
import type { ClientFormStep } from "@forms/types";
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
