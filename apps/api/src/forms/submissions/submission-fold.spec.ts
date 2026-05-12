import { foldErrors, type PerInstanceErrors } from "./submission-fold";
import type { StepInstance } from "./submission-expand";

const inst = (
  stepId: string,
  index: number,
  isRepeatable: boolean,
): StepInstance => ({
  stepId,
  index,
  isRepeatable,
  values: {},
});

describe("foldErrors", () => {
  it("returns empty bundle when no errors", () => {
    const result = foldErrors({
      instances: [inst("personal", 0, false)],
      perInstanceErrors: new Map(),
      stepLevelErrors: new Map(),
    });
    expect(result).toEqual({});
  });

  it("keeps non-repeatable step shape as flat field map (BACKWARDS-COMPAT)", () => {
    const perInstance: PerInstanceErrors = new Map();
    perInstance.set("personal:0", { "first-name": ["First name is required"] });

    const result = foldErrors({
      instances: [inst("personal", 0, false)],
      perInstanceErrors: perInstance,
      stepLevelErrors: new Map(),
    });

    expect(result).toEqual({
      personal: { "first-name": ["First name is required"] },
    });
  });

  it("emits repeatable shape with instances array when errors exist", () => {
    const perInstance: PerInstanceErrors = new Map();
    perInstance.set("jobs:0", { employer: ["Employer is required"] });

    const result = foldErrors({
      instances: [inst("jobs", 0, true), inst("jobs", 1, true)],
      perInstanceErrors: perInstance,
      stepLevelErrors: new Map(),
    });

    expect(result).toEqual({
      jobs: {
        instances: [{ employer: ["Employer is required"] }, {}],
      },
    });
  });

  it("emits _step for step-level errors, even when no instance errors", () => {
    const result = foldErrors({
      instances: [],
      perInstanceErrors: new Map(),
      stepLevelErrors: new Map([["jobs", ["Provide at least 1 entry"]]]),
    });

    expect(result).toEqual({
      jobs: {
        _step: ["Provide at least 1 entry"],
        instances: [],
      },
    });
  });

  it("emits both _step and instances when both exist", () => {
    const perInstance: PerInstanceErrors = new Map();
    perInstance.set("jobs:0", { employer: ["x"] });

    const result = foldErrors({
      instances: [inst("jobs", 0, true)],
      perInstanceErrors: perInstance,
      stepLevelErrors: new Map([["jobs", ["min"]]]),
    });

    expect(result).toEqual({
      jobs: {
        _step: ["min"],
        instances: [{ employer: ["x"] }],
      },
    });
  });

  it("omits step entry when neither step-level nor any instance has errors", () => {
    const result = foldErrors({
      instances: [inst("jobs", 0, true), inst("jobs", 1, true)],
      perInstanceErrors: new Map(),
      stepLevelErrors: new Map(),
    });
    expect(result).toEqual({});
  });

  it("preserves instance order via the instances array", () => {
    const perInstance: PerInstanceErrors = new Map();
    perInstance.set("jobs:1", { e: ["x"] });
    const result = foldErrors({
      instances: [inst("jobs", 0, true), inst("jobs", 1, true)],
      perInstanceErrors: perInstance,
      stepLevelErrors: new Map(),
    });
    expect(result).toEqual({
      jobs: { instances: [{}, { e: ["x"] }] },
    });
  });
});
