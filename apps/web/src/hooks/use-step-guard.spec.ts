import { renderHook, act } from "@testing-library/react";
import { useStepGuard } from "./use-step-guard";
import type { ClientFormStep } from "@web/types";

const mockNavigate = jest.fn();

jest.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

function step(stepId: string): ClientFormStep {
  return { stepId, title: stepId, fields: [] };
}

function markComplete(formId: string, ...stepIds: string[]) {
  sessionStorage.setItem(`completedSteps_${formId}`, JSON.stringify(stepIds));
}

const FORM_ID = "test-form";
const steps = [step("step-1"), step("step-2"), step("step-3")];

describe("useStepGuard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockNavigate.mockClear();
  });

  describe("currentIndex", () => {
    it("returns correct index when currentStepId is in activeSteps", () => {
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-2",
        }),
      );
      expect(result.current.currentIndex).toBe(1);
    });

    it("returns -1 when currentStepId is not in activeSteps", () => {
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "hidden-step",
        }),
      );
      expect(result.current.currentIndex).toBe(-1);
    });
  });

  describe("guard effect", () => {
    it("navigates when currentStepId is not in activeSteps (rule 2)", () => {
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "not-a-step",
        }),
      );
      expect(mockNavigate).toHaveBeenCalled();
    });

    it("navigates when preceding step is incomplete (rule 3)", () => {
      // step-1 not completed → step-2 is inaccessible
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-2",
        }),
      );
      expect(mockNavigate).toHaveBeenCalled();
    });

    it("does not navigate when all preceding steps are complete (rule 4)", () => {
      markComplete(FORM_ID, "step-1");
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-2",
        }),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("does not navigate when on the first step (no prerequisites)", () => {
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-1",
        }),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("hidden steps (not in activeSteps) are not counted as prerequisites", () => {
      // activeSteps only has step-1 and step-3 (step-2 hidden)
      const visibleSteps = [step("step-1"), step("step-3")];
      markComplete(FORM_ID, "step-1");
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: visibleSteps,
          currentStepId: "step-3",
        }),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("navigateToStep", () => {
    it("calls navigate when the target step is accessible", () => {
      markComplete(FORM_ID, "step-1");
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-2",
        }),
      );
      mockNavigate.mockClear();
      act(() => result.current.navigateToStep("step-2"));
      expect(mockNavigate).toHaveBeenCalled();
    });

    it("redirects to first incomplete step when target is not accessible", () => {
      // step-1 not complete → step-2 not accessible
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-1",
        }),
      );
      mockNavigate.mockClear();
      act(() => result.current.navigateToStep("step-2"));
      expect(mockNavigate).toHaveBeenCalled();
    });
  });
});
