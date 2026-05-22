/**
 * Barrel coverage for lib/form-builder/index.ts
 *
 * This file imports from the barrel (not from individual modules) so that
 * Istanbul records the CommonJS re-export getters as "covered." All substantive
 * behaviour is tested in the individual spec files; this file only exercises the
 * exports to ensure the barrel's function-coverage metrics are correct.
 */

import {
  fetchContract,
  buildForm,
  getFullFieldId,
  stepFieldIdConcactenator,
  mapContractToLocale,
  setupRepeatSteps,
  generateRepeatableAddAnotherField,
  generateRepeatStepFields,
  repeatStepConcactenator,
  getRepeatStepId,
  getRepeatStepCount,
  removeRepeatableStep,
  addRepeatableStep,
  restoreRepeatableStepsFromStorage,
  checkConditionalOn,
  getVisibleSteps,
  getStepConditonalTargets,
  contractQueryOptions,
  formMetaQueryOptions,
} from "./index";

describe("lib/form-builder barrel (index.ts)", () => {
  it("exports all expected functions and constants", () => {
    expect(typeof fetchContract).toBe("function");
    expect(typeof buildForm).toBe("function");
    expect(typeof getFullFieldId).toBe("function");
    expect(typeof mapContractToLocale).toBe("function");
    expect(typeof setupRepeatSteps).toBe("function");
    expect(typeof generateRepeatableAddAnotherField).toBe("function");
    expect(typeof generateRepeatStepFields).toBe("function");
    expect(typeof getRepeatStepId).toBe("function");
    expect(typeof getRepeatStepCount).toBe("function");
    expect(typeof removeRepeatableStep).toBe("function");
    expect(typeof addRepeatableStep).toBe("function");
    expect(typeof restoreRepeatableStepsFromStorage).toBe("function");
    expect(typeof checkConditionalOn).toBe("function");
    expect(typeof getVisibleSteps).toBe("function");
    expect(typeof getStepConditonalTargets).toBe("function");
    expect(typeof contractQueryOptions).toBe("function");
    expect(typeof formMetaQueryOptions).toBe("function");
  });

  it("re-exports constants with correct types", () => {
    expect(typeof stepFieldIdConcactenator).toBe("string");
    expect(typeof repeatStepConcactenator).toBe("string");
  });

  it("getRepeatStepId builds a step~count string", () => {
    expect(getRepeatStepId("personal", 2)).toBe("personal~2");
  });

  it("getRepeatStepCount parses the repeat index from a step ID", () => {
    expect(getRepeatStepCount("personal~3")).toBe(3);
  });

  it("getFullFieldId concatenates step and field with the separator", () => {
    const result = getFullFieldId("step1", "firstName");
    expect(result).toContain("step1");
    expect(result).toContain("firstName");
  });

  it("getVisibleSteps returns all steps when there are no conditional behaviours", () => {
    const steps = [{ stepId: "s1", title: "S1", fields: [] }];
    const result = getVisibleSteps(steps, {} as any);
    expect(result).toEqual(steps);
  });

  it("getStepConditonalTargets returns an empty object for steps with no behaviours", () => {
    const result = getStepConditonalTargets([
      { stepId: "s1", title: "S1", fields: [] },
    ]);
    expect(result).toEqual({});
  });

  it("contractQueryOptions returns a query options object for the given formId", () => {
    const opts = contractQueryOptions("test-form");
    expect(opts).toBeTruthy();
    expect(opts.queryKey).toBeDefined();
  });

  it("formMetaQueryOptions returns a query options object", () => {
    const opts = formMetaQueryOptions("test-form", {} as any);
    expect(opts).toBeTruthy();
    expect(opts.queryKey).toBeDefined();
  });
});
