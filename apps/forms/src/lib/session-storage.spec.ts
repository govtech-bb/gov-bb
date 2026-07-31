/**
 * session-storage.spec.ts
 *
 * Unit tests for the session-storage helper functions.
 *
 * Coverage:
 *  - storeFormData / getFormData: round-trip; returns null when not set
 *  - storeFormData strips File instances
 *  - storeFormData strips Blob instances
 *  - storeFormData strips undefined from nested objects; filters undefined from arrays
 *  - getCompletedSteps: returns [] when not set; returns stored array
 *  - markStepCompleted: adds step; does not add duplicate
 *  - getFirstIncompleteActiveStep: first incomplete step object; null when all done
 *  - isStepAccessible: first step always accessible; true when all preceding completed;
 *                      false when preceding incomplete; false when stepId not in list
 */

import {
  storeFormData,
  getFormData,
  clearFormState,
  getCompletedSteps,
  markStepCompleted,
  getFirstIncompleteActiveStep,
  isStepAccessible,
  storeSubmissionState,
  getSubmissionState,
  clearSubmissionState,
  clearFormStartTime,
  getFormStartTime,
  persistFormStartTime,
} from "./session-storage";
import type { SubmissionState } from "@forms/types";

const FORM_ID = "form_abc";

beforeEach(() => {
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// storeFormData / getFormData
// ---------------------------------------------------------------------------

describe("storeFormData / getFormData", () => {
  it("round-trips plain string values correctly", () => {
    storeFormData(FORM_ID, { step1_name: "Alice", step1_age: "30" });
    const result = getFormData(FORM_ID);
    expect(result).toEqual({ step1_name: "Alice", step1_age: "30" });
  });

  it("returns null when no data has been stored", () => {
    expect(getFormData(FORM_ID)).toBeNull();
  });

  it("strips File instances from the data before storing", () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    storeFormData(FORM_ID, { step1_name: "Alice", step1_file: file as never });
    const result = getFormData(FORM_ID);
    expect(result).toEqual({ step1_name: "Alice" });
    expect(result.step1_file).toBeUndefined();
  });

  it("strips Blob instances from the data before storing", () => {
    const blob = new Blob(["data"], { type: "text/plain" });
    storeFormData(FORM_ID, { step1_blob: blob as never, step1_name: "Bob" });
    const result = getFormData(FORM_ID);
    expect(result).toEqual({ step1_name: "Bob" });
    expect(result.step1_blob).toBeUndefined();
  });

  it("strips undefined values from nested objects", () => {
    storeFormData(FORM_ID, {
      step1_name: "Carol",
      step1_extra: undefined as never,
    });
    const result = getFormData(FORM_ID);
    expect(result).toEqual({ step1_name: "Carol" });
    expect("step1_extra" in result).toBe(false);
  });

  it("filters undefined entries out of arrays", () => {
    // Simulate an array that contains a File (which becomes undefined after stripping)
    const file = new File(["x"], "a.pdf");
    storeFormData(FORM_ID, {
      step1_items: ["kept", file] as never,
    });
    const result = getFormData(FORM_ID);
    // The File is stripped; the array retains only non-undefined entries
    expect(result.step1_items).toEqual(["kept"]);
  });
});

// ---------------------------------------------------------------------------
// clearFormState
// ---------------------------------------------------------------------------

describe("clearFormState", () => {
  it("removes both the stored field values and the completed steps", () => {
    storeFormData(FORM_ID, { step1_name: "Alice" });
    markStepCompleted(FORM_ID, "step1");

    clearFormState(FORM_ID);

    expect(getFormData(FORM_ID)).toBeNull();
    expect(getCompletedSteps(FORM_ID)).toEqual([]);
  });

  it("is a no-op when nothing has been stored", () => {
    expect(() => clearFormState(FORM_ID)).not.toThrow();
    expect(getFormData(FORM_ID)).toBeNull();
    expect(getCompletedSteps(FORM_ID)).toEqual([]);
  });

  it("does not touch state stored under a different form id", () => {
    storeFormData(FORM_ID, { step1_name: "Alice" });
    markStepCompleted(FORM_ID, "step1");
    storeFormData("other-form", { step1_name: "Bob" });
    markStepCompleted("other-form", "step1");

    clearFormState(FORM_ID);

    expect(getFormData(FORM_ID)).toBeNull();
    expect(getFormData("other-form")).toEqual({ step1_name: "Bob" });
    expect(getCompletedSteps("other-form")).toEqual(["step1"]);
  });
});

// ---------------------------------------------------------------------------
// getCompletedSteps
// ---------------------------------------------------------------------------

describe("getCompletedSteps", () => {
  it("returns an empty array when no steps have been stored", () => {
    expect(getCompletedSteps(FORM_ID)).toEqual([]);
  });

  it("returns the stored array of completed step ids", () => {
    sessionStorage.setItem(
      `completedSteps_${FORM_ID}`,
      JSON.stringify(["step1", "step2"]),
    );
    expect(getCompletedSteps(FORM_ID)).toEqual(["step1", "step2"]);
  });
});

// ---------------------------------------------------------------------------
// markStepCompleted
// ---------------------------------------------------------------------------

describe("markStepCompleted", () => {
  it("adds a new step id to the completed list", () => {
    markStepCompleted(FORM_ID, "step1");
    expect(getCompletedSteps(FORM_ID)).toContain("step1");
  });

  it("does not add a duplicate step id", () => {
    markStepCompleted(FORM_ID, "step1");
    markStepCompleted(FORM_ID, "step1");
    expect(getCompletedSteps(FORM_ID)).toEqual(["step1"]);
  });

  it("accumulates multiple distinct step ids", () => {
    markStepCompleted(FORM_ID, "step1");
    markStepCompleted(FORM_ID, "step2");
    expect(getCompletedSteps(FORM_ID)).toEqual(["step1", "step2"]);
  });
});

// ---------------------------------------------------------------------------
// getFirstIncompleteActiveStep
// ---------------------------------------------------------------------------

describe("getFirstIncompleteActiveStep", () => {
  const activeSteps = [
    { stepId: "step1" },
    { stepId: "step2" },
    { stepId: "step3" },
  ];

  it("returns the first step object when nothing is completed", () => {
    expect(getFirstIncompleteActiveStep(FORM_ID, activeSteps)).toEqual({
      stepId: "step1",
    });
  });

  it("returns the first incomplete step object when some are completed", () => {
    markStepCompleted(FORM_ID, "step1");
    expect(getFirstIncompleteActiveStep(FORM_ID, activeSteps)).toEqual({
      stepId: "step2",
    });
  });

  it("returns null when all active steps are completed", () => {
    markStepCompleted(FORM_ID, "step1");
    markStepCompleted(FORM_ID, "step2");
    markStepCompleted(FORM_ID, "step3");
    expect(getFirstIncompleteActiveStep(FORM_ID, activeSteps)).toBeNull();
  });

  it("returns null for an empty activeSteps array", () => {
    expect(getFirstIncompleteActiveStep(FORM_ID, [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isStepAccessible
// ---------------------------------------------------------------------------

describe("isStepAccessible", () => {
  const activeSteps = [
    { stepId: "step1" },
    { stepId: "step2" },
    { stepId: "step3" },
  ];

  it("returns true for the first step (no prerequisites)", () => {
    expect(isStepAccessible(FORM_ID, "step1", activeSteps)).toBe(true);
  });

  it("returns true when all preceding steps are completed", () => {
    markStepCompleted(FORM_ID, "step1");
    markStepCompleted(FORM_ID, "step2");
    expect(isStepAccessible(FORM_ID, "step3", activeSteps)).toBe(true);
  });

  it("returns false when a preceding step is incomplete", () => {
    markStepCompleted(FORM_ID, "step1");
    // step2 not completed → step3 is not accessible
    expect(isStepAccessible(FORM_ID, "step3", activeSteps)).toBe(false);
  });

  it("returns false when targetStepId is not in activeSteps", () => {
    markStepCompleted(FORM_ID, "step1");
    markStepCompleted(FORM_ID, "step2");
    expect(isStepAccessible(FORM_ID, "step_hidden", activeSteps)).toBe(false);
  });

  it("returns false for any step when activeSteps is empty", () => {
    expect(isStepAccessible(FORM_ID, "step1", [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// form start time
// ---------------------------------------------------------------------------

describe("form start time", () => {
  it("persists and reads back a numeric start time", () => {
    persistFormStartTime("form_abc");
    const t = getFormStartTime("form_abc");
    expect(typeof t).toBe("number");
  });
  it("returns null when absent", () => {
    expect(getFormStartTime("never-started")).toBeNull();
  });
  it("clears the start time", () => {
    persistFormStartTime("form_abc");
    clearFormStartTime("form_abc");
    expect(getFormStartTime("form_abc")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// submissionState persistence — lets the confirmation step survive a refresh
// ---------------------------------------------------------------------------
describe("submissionState persistence", () => {
  const state: SubmissionState = {
    hasPayment: false,
    serviceName: "Test Service",
    submissionSuccess: true,
    referenceNumber: "REF-001",
    date: "01/01/2026",
  };

  it("round-trips a stored submissionState", () => {
    storeSubmissionState(FORM_ID, state);
    expect(getSubmissionState(FORM_ID)).toEqual(state);
  });

  it("returns null when no submissionState is stored", () => {
    expect(getSubmissionState(FORM_ID)).toBeNull();
  });

  it("clearSubmissionState removes the stored submissionState", () => {
    storeSubmissionState(FORM_ID, state);
    clearSubmissionState(FORM_ID);
    expect(getSubmissionState(FORM_ID)).toBeNull();
  });

  it("clearFormState leaves submissionState intact (it must survive submit success)", () => {
    storeSubmissionState(FORM_ID, state);
    storeFormData(FORM_ID, { firstName: "Ada" });
    clearFormState(FORM_ID);
    // Draft is dropped, but the committed outcome persists so a refresh on the
    // confirmation step can still render it.
    expect(getFormData(FORM_ID)).toBeNull();
    expect(getSubmissionState(FORM_ID)).toEqual(state);
  });
});
