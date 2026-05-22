import { isRepeatableStepErrors } from "./submissions.types";
import type { RepeatableStepErrors, FieldErrorMap } from "./submissions.types";

describe("isRepeatableStepErrors", () => {
  it("returns true when the bundle has an instances property", () => {
    const bundle: RepeatableStepErrors = { instances: [] };
    expect(isRepeatableStepErrors(bundle)).toBe(true);
  });

  it("returns true when the bundle has _step and instances", () => {
    const bundle: RepeatableStepErrors = {
      _step: ["At least one entry required"],
      instances: [{ field: ["Required"] }],
    };
    expect(isRepeatableStepErrors(bundle)).toBe(true);
  });

  it("returns false for a flat FieldErrorMap (no instances key)", () => {
    const bundle: FieldErrorMap = { field: ["Required"] };
    expect(isRepeatableStepErrors(bundle)).toBe(false);
  });

  it("returns false for an empty FieldErrorMap", () => {
    expect(isRepeatableStepErrors({})).toBe(false);
  });
});
