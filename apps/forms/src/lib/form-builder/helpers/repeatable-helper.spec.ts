/**
 * repeatable-helper.spec.ts
 *
 * Unit tests for the repeatable step helper functions.
 *
 * Coverage:
 *  - repeatStepConcactenator: verify constant value
 *  - getRepeatStepId: builds stepId~count strings
 *  - getRepeatStepCount: extracts count, returns 0 for base step, undefined for non-numeric suffix
 *  - generateRepeatableAddAnotherField: returns correct ClientPrimitive shape
 *  - generateRepeatStepFields: maps fields to new stepId, filters shared fields
 *  - setupRepeatSteps: repeatable step with min; repeatable step without min (addAnother)
 *  - addRepeatableStep: happy path; at max guard; step already exists guard; missing config guard
 *  - removeRepeatableStep: happy path; step not in orderedStepIds guard; missing target in visibleSteps
 *  - restoreRepeatableStepsFromStorage: restores missing repeat instances from saved keys
 */

import {
  repeatStepConcactenator,
  getRepeatStepId,
  getRepeatStepCount,
  generateRepeatableAddAnotherField,
  generateRepeatStepFields,
  setupRepeatSteps,
  addRepeatableStep,
  removeRepeatableStep,
  restoreRepeatableStepsFromStorage,
  getEffectiveRepeatBounds,
  getInstanceMarker,
} from "./repeatable-helper";
import type {
  ClientFormStep,
  ClientPrimitive,
  FormMeta,
  RepeatableStepSettings,
} from "@forms/types";
import type {
  RepeatableBehaviour,
  SharedFieldsBehaviour,
} from "@govtech-bb/form-types";
import z from "zod";

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

function makeField(fieldId: string, stepId: string): ClientPrimitive {
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
  };
}

function makeStep(
  stepId: string,
  fieldIds: string[] = [],
  behaviours?: ClientFormStep["behaviours"],
): ClientFormStep {
  return {
    stepId,
    title: `Step ${stepId}`,
    fields: fieldIds.map((fid) => makeField(fid, stepId)),
    behaviours,
  };
}

function makeRepeatableBehaviour(
  min: number,
  max: number,
): RepeatableBehaviour {
  return { type: "repeatable", min, max };
}

function makeSharedFieldsBehaviour(fieldIds: string[]): SharedFieldsBehaviour {
  return { type: "sharedFields", fieldIds };
}

function makeFormMeta(steps: ClientFormStep[]): FormMeta {
  return {
    formId: "test-form",
    version: "1",
    formTitle: "Test Form",
    schema: z.object({}),
    steps,
    defaultValues: {},
    validationProperties: {},
    stepConditionalTargets: {},
    repeatSettings: {},
    idempotencyKey: "key",
  };
}

// ---------------------------------------------------------------------------
// repeatStepConcactenator
// ---------------------------------------------------------------------------

describe("repeatStepConcactenator", () => {
  it("is the tilde character", () => {
    expect(repeatStepConcactenator).toBe("~");
  });
});

// ---------------------------------------------------------------------------
// getRepeatStepId
// ---------------------------------------------------------------------------

describe("getRepeatStepId", () => {
  it("joins stepId and count with the concatenator", () => {
    expect(getRepeatStepId("personalInfo", 1)).toBe("personalInfo~1");
    expect(getRepeatStepId("personalInfo", 2)).toBe("personalInfo~2");
  });

  it("works with multi-part step IDs", () => {
    expect(getRepeatStepId("section-A", 3)).toBe("section-A~3");
  });
});

// ---------------------------------------------------------------------------
// getRepeatStepCount
// ---------------------------------------------------------------------------

describe("getRepeatStepCount", () => {
  it("returns 0 for a base step ID with no separator", () => {
    expect(getRepeatStepCount("personalInfo")).toBe(0);
  });

  it("returns the numeric suffix for a repeat step ID", () => {
    expect(getRepeatStepCount("personalInfo~1")).toBe(1);
    expect(getRepeatStepCount("personalInfo~5")).toBe(5);
  });

  it("returns undefined when the suffix after the separator is non-numeric", () => {
    expect(getRepeatStepCount("personalInfo~abc")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getInstanceMarker
// ---------------------------------------------------------------------------

describe("getInstanceMarker", () => {
  it("returns undefined for a base step (instance 1 is never marked)", () => {
    const step = makeStep(
      "dependents",
      ["firstName"],
      [makeRepeatableBehaviour(1, 5)],
    );
    expect(getInstanceMarker(step)).toBeUndefined();
  });

  it("returns undefined for a step with no behaviours and no repeat suffix", () => {
    expect(getInstanceMarker(makeStep("personalInfo"))).toBeUndefined();
  });

  it("returns undefined when the repeat suffix is non-numeric", () => {
    const step = makeStep("dependents~abc");
    expect(getInstanceMarker(step)).toBeUndefined();
  });

  it("auto-numbers a ~N instance when no instanceLabel is configured", () => {
    // Without sharedFields the base step is instance 1, so ~1 displays as 2.
    const step = makeStep(
      "dependents~1",
      ["firstName"],
      [makeRepeatableBehaviour(1, 5)],
    );
    expect(getInstanceMarker(step)).toEqual({ text: "2", hasLabel: false });
  });

  it("numbers later instances by suffix + 1 without sharedFields", () => {
    const step = makeStep(
      "dependents~3",
      ["firstName"],
      [makeRepeatableBehaviour(1, 5)],
    );
    expect(getInstanceMarker(step)).toEqual({ text: "4", hasLabel: false });
  });

  it("uses the configured instanceLabel with the display number", () => {
    const step = makeStep(
      "dependents~1",
      ["firstName"],
      [{ ...makeRepeatableBehaviour(1, 5), instanceLabel: "Dependent" }],
    );
    expect(getInstanceMarker(step)).toEqual({
      text: "Dependent 2",
      hasLabel: true,
    });
  });

  it("auto-numbers a ~N instance that lost its behaviours", () => {
    // Defensive: a ~N suffix only arises from repeatable cloning, so the
    // fallback marker still applies even if behaviours are missing.
    const step = makeStep("dependents~1");
    expect(getInstanceMarker(step)).toEqual({ text: "2", hasLabel: false });
  });

  describe("with sharedFields (base step is a separate shared-values page)", () => {
    // In the shared-fields layout the instances are ~1..~min and the base
    // step holds only the shared fields — so ~1 IS instance 1.
    const behaviours = (label?: string): ClientFormStep["behaviours"] => [
      label
        ? { ...makeRepeatableBehaviour(2, 5), instanceLabel: label }
        : makeRepeatableBehaviour(2, 5),
      makeSharedFieldsBehaviour(["sharedField"]),
    ];

    it("returns undefined for ~1 (it is instance 1)", () => {
      const step = makeStep("dependents~1", ["firstName"], behaviours());
      expect(getInstanceMarker(step)).toBeUndefined();
    });

    it("numbers ~N as N", () => {
      const step = makeStep("dependents~2", ["firstName"], behaviours());
      expect(getInstanceMarker(step)).toEqual({ text: "2", hasLabel: false });
    });

    it("combines instanceLabel with the shared-fields numbering", () => {
      const step = makeStep(
        "dependents~3",
        ["firstName"],
        behaviours("Dependent"),
      );
      expect(getInstanceMarker(step)).toEqual({
        text: "Dependent 3",
        hasLabel: true,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// generateRepeatableAddAnotherField
// ---------------------------------------------------------------------------

describe("generateRepeatableAddAnotherField", () => {
  it("returns a ClientPrimitive with the correct shape", () => {
    const field = generateRepeatableAddAnotherField("personalInfo");
    expect(field.fieldId).toBe("addAnother");
    expect(field.stepId).toBe("personalInfo");
    expect(field.id).toBe("personalInfo_addAnother");
    expect(field.htmlType).toBe("radio");
    expect(field.disabled).toBe(false);
    expect(field.hidden).toBe(false);
    expect(field.conditionallyHidden).toBe(false);
    expect(field.options).toEqual([
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ]);
    expect(field.validations?.required?.value).toBe(true);
  });

  it("defaults the label to 'Add another?' when none is given", () => {
    const field = generateRepeatableAddAnotherField("personalInfo");
    expect(field.label).toBe("Add another?");
  });

  it("uses a custom label when provided", () => {
    const field = generateRepeatableAddAnotherField(
      "qualifications",
      "Do you want to add another qualification?",
    );
    expect(field.label).toBe("Do you want to add another qualification?");
  });
});

// ---------------------------------------------------------------------------
// getEffectiveRepeatBounds
// ---------------------------------------------------------------------------

describe("getEffectiveRepeatBounds", () => {
  it("returns min:1 max:Infinity for bare {type:'repeatable'} (no min/max) (#771)", () => {
    const bounds = getEffectiveRepeatBounds({ type: "repeatable" });
    expect(bounds.min).toBe(1);
    expect(bounds.max).toBe(Infinity);
  });

  it("clamps min:0 to 1 and uses valid max (#771)", () => {
    const bounds = getEffectiveRepeatBounds({
      type: "repeatable",
      min: 0,
      max: 5,
    });
    expect(bounds.min).toBe(1);
    expect(bounds.max).toBe(5);
  });

  it("floors fractional min:2.7 and treats max:-1 as Infinity (#771)", () => {
    const bounds = getEffectiveRepeatBounds({
      type: "repeatable",
      min: 2.7,
      max: -1,
    } as unknown as RepeatableBehaviour);
    expect(bounds.min).toBe(2);
    expect(bounds.max).toBe(Infinity);
  });

  it("passes through valid min:2 max:5 unchanged (#771)", () => {
    const bounds = getEffectiveRepeatBounds({
      type: "repeatable",
      min: 2,
      max: 5,
    });
    expect(bounds.min).toBe(2);
    expect(bounds.max).toBe(5);
  });

  it("treats max equal to min as valid cap (#771)", () => {
    const bounds = getEffectiveRepeatBounds({
      type: "repeatable",
      min: 1,
      max: 1,
    });
    expect(bounds.min).toBe(1);
    expect(bounds.max).toBe(1);
  });

  it("treats max less than effective min as Infinity (#771)", () => {
    // max:1 with min:3 — floor(1) < min(3) → Infinity
    const bounds = getEffectiveRepeatBounds({
      type: "repeatable",
      min: 3,
      max: 1,
    });
    expect(bounds.min).toBe(3);
    expect(bounds.max).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// generateRepeatStepFields
// ---------------------------------------------------------------------------

describe("generateRepeatStepFields", () => {
  it("remaps field ids and stepIds to nextStepId", () => {
    const fields = [
      makeField("firstName", "personalInfo"),
      makeField("lastName", "personalInfo"),
    ];
    const result = generateRepeatStepFields(fields, "personalInfo~1");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("personalInfo~1_firstName");
    expect(result[0].stepId).toBe("personalInfo~1");
    expect(result[1].id).toBe("personalInfo~1_lastName");
  });

  it("filters out the addAnotherStepId field when provided", () => {
    const addAnother = generateRepeatableAddAnotherField("personalInfo");
    const fields = [makeField("firstName", "personalInfo"), addAnother];
    const result = generateRepeatStepFields(
      fields,
      "personalInfo~1",
      "personalInfo_addAnother",
    );
    // addAnother field (id === addAnotherStepId) should be filtered
    expect(result.every((f) => f.fieldId !== "addAnother")).toBe(true);
  });

  it("filters out shared fields when sharedFieldBehaviour is provided", () => {
    const fields = [
      makeField("firstName", "personalInfo"),
      makeField("lastName", "personalInfo"),
    ];
    const sharedBehaviour = makeSharedFieldsBehaviour(["firstName"]);
    const result = generateRepeatStepFields(
      fields,
      "personalInfo~1",
      undefined,
      sharedBehaviour,
    );
    // firstName is shared — should be excluded
    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe("lastName");
  });

  it("includes all fields when no shared behaviour and no addAnotherStepId", () => {
    const fields = [makeField("a", "s1"), makeField("b", "s1")];
    const result = generateRepeatStepFields(fields, "s1~1");
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// setupRepeatSteps
// ---------------------------------------------------------------------------

describe("setupRepeatSteps", () => {
  it("renders a single instance on the source step when min=1 with no shared fields (#432)", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    // No shared fields → the source step IS the first instance. min=1 must show
    // exactly ONE instance (the source step), not a duplicate source + ~1 pair.
    expect(result).toHaveLength(1);
    expect(result[0].stepId).toBe("personalInfo");
    // min(1) < max(3), so the (only) instance carries the addAnother control on
    // the source step itself.
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(true);

    // repeatSettings should be populated, with no generated ~1 instance.
    expect(repeatSettings["personalInfo"]).toBeDefined();
    expect(repeatSettings["personalInfo"].orderedStepIds).toEqual([
      "personalInfo",
    ]);
  });

  it("renders min instances on the source + ~N steps when min>1 with no shared fields (#432)", () => {
    const repeatBehaviour = makeRepeatableBehaviour(2, 5);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    // min=2 → source step (instance 1) + personalInfo~1 (instance 2).
    expect(result).toHaveLength(2);
    expect(result[0].stepId).toBe("personalInfo");
    expect(result[1].stepId).toBe("personalInfo~1");
    // The source (not the last instance) has no addAnother; the last instance
    // does, because min(2) < max(5).
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(
      false,
    );
    expect(result[1].fields.some((f) => f.fieldId === "addAnother")).toBe(true);
    expect(repeatSettings["personalInfo"].orderedStepIds).toEqual([
      "personalInfo",
      "personalInfo~1",
    ]);
  });

  it("keeps the source step as a separate shared-values page when sharedFields are present", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const sharedBehaviour = makeSharedFieldsBehaviour(["firstName"]);
    const step = makeStep(
      "personalInfo",
      ["firstName", "lastName"],
      [repeatBehaviour, sharedBehaviour],
    );
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    // With shared fields the source step is the shared-values host and the
    // minimum instances are generated as ~1..~min; addAnother sits on ~1.
    expect(result).toHaveLength(2);
    expect(result[0].stepId).toBe("personalInfo");
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(
      false,
    );
    expect(result[1].stepId).toBe("personalInfo~1");
    expect(result[1].fields.some((f) => f.fieldId === "addAnother")).toBe(true);
    expect(repeatSettings["personalInfo"].orderedStepIds).toEqual([
      "personalInfo",
      "personalInfo~1",
    ]);
  });

  it("legacy min:0 — clamps to 1 and renders exactly one instance with addAnother (#771)", () => {
    // Legacy recipes may carry min:0 (old "base step only" semantics). After
    // normalisation, min:0 must render identically to min:1 — one instance on
    // the source step, with the addAnother radio (because 1 < max=5).
    const repeatBehaviour = makeRepeatableBehaviour(0, 5);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    // Clamped to min=1 → one instance (source step), no extra ~1 generated.
    expect(result).toHaveLength(1);
    expect(result[0].stepId).toBe("personalInfo");
    // 1 < 5, so addAnother must be present.
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(true);
  });

  it("bare behaviour {type:'repeatable'} (no min/max) — one instance with addAnother (#771)", () => {
    // conductor 1.0.0 shape: no min/max at all. Naive canAddMore = 1 < undefined
    // === false would drop the addAnother control. Normalisation must treat
    // missing max as Infinity so canAddMore = 1 < Infinity = true.
    const bareRepeatBehaviour: RepeatableBehaviour = { type: "repeatable" };
    const step = makeStep("personalInfo", ["firstName"], [bareRepeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    expect(result).toHaveLength(1);
    expect(result[0].stepId).toBe("personalInfo");
    // unlimited adds → addAnother must be present
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(true);
  });

  it("min:1 max:1 — one instance, no addAnother (#771)", () => {
    // When min === max there is nothing more to add; addAnother must be absent.
    const repeatBehaviour = makeRepeatableBehaviour(1, 1);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    expect(result).toHaveLength(1);
    expect(result[0].stepId).toBe("personalInfo");
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(
      false,
    );
  });

  it("fractional/invalid bounds min:2.7 max:-1 — two instances, last has addAnother (#771)", () => {
    // min:2.7 → floor → 2 instances; max:-1 is invalid → Infinity (unlimited).
    // So source step + one generated ~1 instance, last one has addAnother.
    const repeatBehaviour = {
      type: "repeatable",
      min: 2.7,
      max: -1,
    } as unknown as RepeatableBehaviour;
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    expect(result).toHaveLength(2);
    expect(result[0].stepId).toBe("personalInfo");
    expect(result[1].stepId).toBe("personalInfo~1");
    // Source step (not last) has no addAnother; last (~1) does.
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(
      false,
    );
    expect(result[1].fields.some((f) => f.fieldId === "addAnother")).toBe(true);
  });

  it("shared-fields step with min:0 — source step + one materialised instance (#771)", () => {
    // Legacy else-branch never materialised instances for shared-fields steps
    // when min was 0. Clamping to 1 fixes that hole.
    const repeatBehaviour = makeRepeatableBehaviour(0, 3);
    const sharedBehaviour = makeSharedFieldsBehaviour(["firstName"]);
    const step = makeStep(
      "personalInfo",
      ["firstName", "lastName"],
      [repeatBehaviour, sharedBehaviour],
    );
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    // Source step (shared-values host) + one materialised instance (~1).
    expect(result).toHaveLength(2);
    expect(result[0].stepId).toBe("personalInfo");
    expect(result[1].stepId).toBe("personalInfo~1");
    // ~1 is the only instance and 1 < max(3) → has addAnother.
    expect(result[1].fields.some((f) => f.fieldId === "addAnother")).toBe(true);
    expect(repeatSettings["personalInfo"].orderedStepIds).toEqual([
      "personalInfo",
      "personalInfo~1",
    ]);
  });

  it("skips steps without behaviours", () => {
    const step = makeStep("plainStep", ["field1"]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);
    expect(result).toHaveLength(1);
    expect(Object.keys(repeatSettings)).toHaveLength(0);
  });

  it("skips already-repeated steps (count > 0)", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const alreadyRepeated = makeStep(
      "personalInfo~1",
      ["firstName"],
      [repeatBehaviour],
    );
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([alreadyRepeated], repeatSettings);
    // Nothing should be added for a step that already has a repeat suffix
    expect(result).toHaveLength(1);
    expect(Object.keys(repeatSettings)).toHaveLength(0);
  });

  it("rewrites optionalIf targetStepId to the instance step so it resolves instance-locally (#668)", () => {
    // A field with an `optionalIf` controlled by another field in the SAME
    // (instance) step, with no explicit targetStepId. Previously only
    // `fieldConditionalOn` was rewritten, so `optionalIf` inside a repeatable
    // step never resolved instance-locally (it fell back to undefined).
    const repeatBehaviour = makeRepeatableBehaviour(2, 5);
    const step = makeStep(
      "personalInfo",
      ["firstName", "reason"],
      [repeatBehaviour],
    );
    const reason = step.fields.find((f) => f.fieldId === "reason")!;
    reason.behaviours = [
      {
        type: "optionalIf",
        targetFieldId: "firstName",
        operator: "equal",
        value: "skip",
      },
    ];
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    expect(result).toHaveLength(2);
    // Source step (instance 1) → rewritten to its own step id.
    const sourceOptionalIf = result[0].fields
      .find((f) => f.fieldId === "reason")
      ?.behaviours?.find((b) => b.type === "optionalIf");
    expect(sourceOptionalIf?.targetStepId).toBe("personalInfo");
    // Generated instance (~1) → rewritten to the instance step id, so it
    // resolves against THIS instance's controlling field (matching the server).
    const instanceOptionalIf = result[1].fields
      .find((f) => f.fieldId === "reason")
      ?.behaviours?.find((b) => b.type === "optionalIf");
    expect(instanceOptionalIf?.targetStepId).toBe("personalInfo~1");
  });

  it("rewrites optionalIf targetStepId to the SOURCE step when it targets a shared field (#668)", () => {
    // When the optionalIf targets a shared field, it must resolve against the
    // source (shared-values) step — the same rule fieldConditionalOn uses.
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const sharedBehaviour = makeSharedFieldsBehaviour(["firstName"]);
    const step = makeStep(
      "personalInfo",
      ["firstName", "reason"],
      [repeatBehaviour, sharedBehaviour],
    );
    const reason = step.fields.find((f) => f.fieldId === "reason")!;
    reason.behaviours = [
      {
        type: "optionalIf",
        targetFieldId: "firstName",
        operator: "equal",
        value: "skip",
      },
    ];
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    // With shared fields the instance is materialised as personalInfo~1; its
    // optionalIf targets the shared `firstName`, which lives once on the source
    // (shared-values) step, so it must point at the source step, not ~1.
    const instanceOptionalIf = result[1].fields
      .find((f) => f.fieldId === "reason")
      ?.behaviours?.find((b) => b.type === "optionalIf");
    expect(instanceOptionalIf?.targetStepId).toBe("personalInfo");
  });

  it("does NOT append addAnother to the last instance when min === max (no shared fields)", () => {
    const repeatBehaviour = makeRepeatableBehaviour(2, 2);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {};

    const result = setupRepeatSteps([step], repeatSettings);

    // No shared fields: source step is instance 1, so min=2 → source + ~1.
    expect(result).toHaveLength(2);
    // The last instance (personalInfo~1) is at min AND max → no addAnother.
    const lastStep = result[result.length - 1];
    expect(lastStep.stepId).toBe("personalInfo~1");
    expect(lastStep.fields.some((f) => f.fieldId === "addAnother")).toBe(false);
    // The source step is also not the place for addAnother here.
    expect(result[0].fields.some((f) => f.fieldId === "addAnother")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// addRepeatableStep
// ---------------------------------------------------------------------------

describe("addRepeatableStep", () => {
  it("adds a new repeat step when below max", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatStep1 = makeStep(
      "personalInfo~1",
      ["firstName"],
      [repeatBehaviour],
    );
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 3,
        orderedStepIds: ["personalInfo", "personalInfo~1"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, repeatStep1]);
    const visibleSteps = [step, repeatStep1];

    const result = addRepeatableStep({
      currentStep: repeatStep1,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    // A new step personalInfo~2 should be added
    expect(result).toHaveLength(3);
    expect(result[2].stepId).toBe("personalInfo~2");
    expect(repeatSettings["personalInfo"].orderedStepIds).toContain(
      "personalInfo~2",
    );
  });

  it("carries addAnotherLabel onto the new instance's addAnother control", () => {
    const repeatBehaviour: RepeatableBehaviour = {
      ...makeRepeatableBehaviour(1, 4),
      addAnotherLabel: "Add another teacher?",
    };
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatStep1 = makeStep(
      "personalInfo~1",
      ["firstName"],
      [repeatBehaviour],
    );
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 4,
        orderedStepIds: ["personalInfo", "personalInfo~1"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, repeatStep1]);
    const visibleSteps = [step, repeatStep1];

    const result = addRepeatableStep({
      currentStep: repeatStep1,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    // The dynamically added instance (~2) must keep the custom label,
    // not fall back to the "Add another?" default.
    const addAnother = result[2].fields.find((f) => f.fieldId === "addAnother");
    expect(addAnother?.label).toBe("Add another teacher?");
  });

  it("returns visibleSteps unchanged when at max", () => {
    const repeatBehaviour = makeRepeatableBehaviour(2, 2);
    const step = makeStep("personalInfo", ["firstName"]);
    const step1 = makeStep("personalInfo~1", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 2,
        maxRepeats: 2,
        orderedStepIds: ["personalInfo", "personalInfo~1"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, step1]);
    const visibleSteps = [step, step1];

    const result = addRepeatableStep({
      currentStep: step1,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    expect(result).toBe(visibleSteps);
    expect(result).toHaveLength(2);
  });

  it("returns visibleSteps unchanged when next stepId already exists in orderedStepIds", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 5);
    const step = makeStep("personalInfo", ["firstName"]);
    const step1 = makeStep("personalInfo~1", ["firstName"]);
    const step2 = makeStep("personalInfo~2", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 5,
        orderedStepIds: ["personalInfo", "personalInfo~1", "personalInfo~2"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, step1, step2]);
    const visibleSteps = [step, step1, step2];

    const result = addRepeatableStep({
      currentStep: step1,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    expect(result).toBe(visibleSteps);
  });

  it("returns visibleSteps unchanged when no repeatConfig exists for baseStepId", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const step = makeStep("personalInfo", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {};
    const formMeta = makeFormMeta([step]);
    const visibleSteps = [step];

    const result = addRepeatableStep({
      currentStep: step,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    expect(result).toBe(visibleSteps);
  });

  it("returns visibleSteps unchanged when stepRepeatId is undefined (non-numeric suffix)", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const step = makeStep("personalInfo~abc", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {};
    const formMeta = makeFormMeta([step]);
    const visibleSteps = [step];

    const result = addRepeatableStep({
      currentStep: step,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    expect(result).toBe(visibleSteps);
  });

  it("returns visibleSteps unchanged when repeatableBehaviour is undefined", () => {
    const step = makeStep("personalInfo", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 3,
        orderedStepIds: ["personalInfo"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step]);
    const visibleSteps = [step];

    const result = addRepeatableStep({
      currentStep: step,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: undefined,
      visibleSteps,
      formMeta,
    });

    expect(result).toBe(visibleSteps);
  });

  it("negative max is treated as unlimited — adding past first instance is not blocked (#771)", () => {
    // Before normalisation, repeatableBehaviour.max = -2 is truthy → the guard
    // `max && count >= max` triggers immediately and blocks all adds. After
    // normalisation, invalid max → Infinity → never blocks.
    const repeatBehaviour = {
      type: "repeatable",
      min: 1,
      max: -2,
    } as unknown as RepeatableBehaviour;
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatStep1 = makeStep(
      "personalInfo~1",
      ["firstName"],
      [repeatBehaviour],
    );
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: -2,
        orderedStepIds: ["personalInfo", "personalInfo~1"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, repeatStep1]);
    const visibleSteps = [step, repeatStep1];

    const result = addRepeatableStep({
      currentStep: repeatStep1,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    // Should NOT be blocked — new step personalInfo~2 must be added.
    expect(result).toHaveLength(3);
    expect(result[2].stepId).toBe("personalInfo~2");
  });

  it("appends addAnother to the new step when repeatableStepCount < max - 1", () => {
    // max=4, orderedStepIds has 2 entries (count=2) → 2 < 4-1=3 → true → addAnother appended
    const repeatBehaviour = makeRepeatableBehaviour(1, 4);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const step1 = makeStep("personalInfo~1", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 4,
        orderedStepIds: ["personalInfo", "personalInfo~1"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, step1]);
    const visibleSteps = [step, step1];

    const result = addRepeatableStep({
      currentStep: step1,
      repeatableStepSettings: repeatSettings,
      repeatableBehaviour: repeatBehaviour,
      visibleSteps,
      formMeta,
    });

    // New step personalInfo~2 should be added
    expect(result).toHaveLength(3);
    const newStep = result[2];
    expect(newStep.stepId).toBe("personalInfo~2");
    // addAnother should be present because repeatableStepCount(2) < max(4) - 1 = 3
    expect(newStep.fields.some((f) => f.fieldId === "addAnother")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeRepeatableStep
// ---------------------------------------------------------------------------

describe("removeRepeatableStep", () => {
  it("removes repeat steps from visibleSteps and formMeta starting from next step", () => {
    const step = makeStep("personalInfo", ["firstName"]);
    const step1 = makeStep("personalInfo~1", ["firstName"]);
    const step2 = makeStep("personalInfo~2", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 5,
        orderedStepIds: ["personalInfo", "personalInfo~1", "personalInfo~2"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, step1, step2]);
    const visibleSteps = [step, step1, step2];

    const result = removeRepeatableStep({
      currentStep: step,
      visibleSteps,
      repeatableStepSettings: repeatSettings,
      formMeta,
    });

    // step1 and step2 should be removed (targetStepId = personalInfo~1)
    expect(result).not.toContain(step1);
    expect(result).not.toContain(step2);
    expect(result).toHaveLength(1);
  });

  it("returns visibleSteps unchanged when the target stepId is not in orderedStepIds", () => {
    const step = makeStep("personalInfo", ["firstName"]);
    const step1 = makeStep("personalInfo~1", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 5,
        // personalInfo~1 not listed → target not found
        orderedStepIds: ["personalInfo"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step, step1]);
    const visibleSteps = [step, step1];

    const result = removeRepeatableStep({
      currentStep: step,
      visibleSteps,
      repeatableStepSettings: repeatSettings,
      formMeta,
    });

    expect(result).toBe(visibleSteps);
  });

  it("returns visibleSteps unchanged when stepRepeatId is undefined (non-numeric suffix)", () => {
    const step = makeStep("personalInfo~abc", ["firstName"]);
    const repeatSettings: RepeatableStepSettings = {};
    const formMeta = makeFormMeta([step]);
    const visibleSteps = [step];

    const result = removeRepeatableStep({
      currentStep: step,
      visibleSteps,
      repeatableStepSettings: repeatSettings,
      formMeta,
    });

    expect(result).toBe(visibleSteps);
  });

  it("removes the orphan id from orderedStepIds when targetStep is not in visibleSteps", () => {
    const step = makeStep("personalInfo", ["firstName"]);
    // personalInfo~1 is in orderedStepIds but not in visibleSteps
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 5,
        orderedStepIds: ["personalInfo", "personalInfo~1"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step]);
    const visibleSteps = [step];

    const result = removeRepeatableStep({
      currentStep: step,
      visibleSteps,
      repeatableStepSettings: repeatSettings,
      formMeta,
    });

    // No crash; visibleSteps returned unfiltered
    expect(result).toBe(visibleSteps);
    expect(repeatSettings.personalInfo.orderedStepIds).not.toContain(
      "personalInfo~1",
    );
  });
});

// ---------------------------------------------------------------------------
// restoreRepeatableStepsFromStorage
// ---------------------------------------------------------------------------

describe("restoreRepeatableStepsFromStorage", () => {
  it("restores a missing repeat instance that appears in savedData keys", () => {
    // Build the initial step/settings state via setupRepeatSteps so the
    // test exercises the real generation flow. If setupRepeatSteps ever
    // stops attaching RepeatableBehaviour to the generated `~N` step,
    // addRepeatableStep (called inside restore) would no-op and this test
    // would fail loudly — rather than passing on a hand-crafted fixture.
    const repeatBehaviour = makeRepeatableBehaviour(1, 5);
    const sourceStep = makeStep(
      "personalInfo",
      ["firstName"],
      [repeatBehaviour],
    );
    const repeatSettings: RepeatableStepSettings = {};
    const generatedSteps = setupRepeatSteps([sourceStep], repeatSettings);
    const formMeta = makeFormMeta(generatedSteps);

    // No shared fields → setup materialises only the source step (instance 1).
    // savedData has keys for ~1 and ~2 — instances the user added before the
    // refresh. Restore must recreate them in order (~1 then ~2).
    const savedData: Record<string, unknown> = {
      "personalInfo~1_firstName": "Joan",
      "personalInfo~2_firstName": "Jane",
    };

    restoreRepeatableStepsFromStorage(savedData, formMeta, repeatSettings);

    // personalInfo~1 and ~2 should now be in formMeta.steps
    expect(formMeta.steps.some((s) => s.stepId === "personalInfo~1")).toBe(
      true,
    );
    expect(formMeta.steps.some((s) => s.stepId === "personalInfo~2")).toBe(
      true,
    );
    expect(repeatSettings["personalInfo"].orderedStepIds).toContain(
      "personalInfo~1",
    );
    expect(repeatSettings["personalInfo"].orderedStepIds).toContain(
      "personalInfo~2",
    );
  });

  it("does nothing when savedData has no keys for missing repeat instances", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 3,
        orderedStepIds: ["personalInfo"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step]);
    const savedData: Record<string, unknown> = {
      personalInfo_firstName: "Alice",
    };

    restoreRepeatableStepsFromStorage(savedData, formMeta, repeatSettings);

    // No new steps should be added
    expect(formMeta.steps).toHaveLength(1);
  });

  it("does nothing when savedData is empty", () => {
    const repeatBehaviour = makeRepeatableBehaviour(1, 3);
    const step = makeStep("personalInfo", ["firstName"], [repeatBehaviour]);
    const repeatSettings: RepeatableStepSettings = {
      personalInfo: {
        minRepeats: 1,
        maxRepeats: 3,
        orderedStepIds: ["personalInfo"],
        stepData: {},
      },
    };
    const formMeta = makeFormMeta([step]);

    restoreRepeatableStepsFromStorage({}, formMeta, repeatSettings);

    expect(formMeta.steps).toHaveLength(1);
  });
});
