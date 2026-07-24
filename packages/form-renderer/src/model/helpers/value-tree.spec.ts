/**
 * value-tree.spec.ts
 *
 * Unit tests for the composite-keyed → StepScopedValues helper shared by both
 * client conditional call sites (behavior-helper + validation-builder).
 */

import { splitCompositeId, buildStepScopedValues } from "./value-tree";

describe("splitCompositeId", () => {
  it("splits a simple stepId_fieldId composite", () => {
    expect(splitCompositeId("step1_colour")).toEqual({
      stepId: "step1",
      fieldId: "colour",
    });
  });

  it("uses the LAST separator so a step id may contain the separator", () => {
    // repeatable instance steps look like `step1~2`, but the separator is `_`;
    // a step id can still legitimately contain `_` (e.g. `my_step`). The field
    // id never contains the separator, so split on the last one.
    expect(splitCompositeId("my_step_colour")).toEqual({
      stepId: "my_step",
      fieldId: "colour",
    });
  });

  it("returns a bare fieldId with empty stepId when there is no separator", () => {
    expect(splitCompositeId("colour")).toEqual({
      stepId: "",
      fieldId: "colour",
    });
  });

  it("treats a leading separator as no usable stepId", () => {
    expect(splitCompositeId("_colour")).toEqual({
      stepId: "",
      fieldId: "_colour",
    });
  });
});

describe("buildStepScopedValues", () => {
  it("groups composite-keyed values by step", () => {
    const tree = buildStepScopedValues({
      step1_colour: "red",
      step1_size: "large",
      step2_name: "Ada",
    });
    expect(tree).toEqual({
      step1: { colour: "red", size: "large" },
      step2: { name: "Ada" },
    });
  });

  it("returns an empty tree for empty input", () => {
    expect(buildStepScopedValues({})).toEqual({});
  });

  it("keeps repeatable instance steps under their suffixed step id", () => {
    const tree = buildStepScopedValues({
      "person~1_name": "Ada",
      "person~2_name": "Grace",
    });
    expect(tree).toEqual({
      "person~1": { name: "Ada" },
      "person~2": { name: "Grace" },
    });
  });
});
