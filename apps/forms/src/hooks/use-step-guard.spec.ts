import { renderHook, act } from "@testing-library/react";
import { useStepGuard } from "./use-step-guard";
import type { ClientFormStep } from "@forms/types";

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

    it("does not redirect away from the terminal submission-confirmation step when preceding steps are not complete", () => {
      // On a successful submission the completed-step records are cleared, so
      // the confirmation's prerequisites no longer look complete. The guard must
      // still leave the citizen on their confirmation — the renderer, not the
      // guard, decides whether there is a submission to show.
      const confirmationSteps = [
        step("step-1"),
        step("check-your-answers"),
        step("submission-confirmation"),
      ];
      // Nothing is recorded as complete.
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: confirmationSteps,
          currentStepId: "submission-confirmation",
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

    it("uses stepsOverride to evaluate the target's accessibility (navigates to override-target when accessible there)", () => {
      // All three real steps are complete; the override appends a new
      // 'step-extra'. With the override honoured, isStepAccessible can see
      // every prerequisite is satisfied and the navigate lands on
      // 'step-extra'. Without it, step-extra isn't in activeSteps, the
      // accessibility check fails, and the fallback would land elsewhere —
      // so asserting the destination distinguishes override-used from
      // override-ignored.
      markComplete(FORM_ID, "step-1", "step-2", "step-3");
      const extraStep = step("step-extra");
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-3",
        }),
      );
      mockNavigate.mockClear();
      act(() =>
        result.current.navigateToStep("step-extra", [...steps, extraStep]),
      );
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      const searchFn = (
        mockNavigate.mock.calls[0][0] as {
          search: (p: Record<string, unknown>) => Record<string, unknown>;
        }
      ).search;
      expect(searchFn({})).toEqual(
        expect.objectContaining({ step: "step-extra" }),
      );
    });
  });

  describe("completeAndContinue", () => {
    it("marks the step completed and navigates to the next step", () => {
      markComplete(FORM_ID, "step-1");
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-2",
        }),
      );
      mockNavigate.mockClear();
      act(() => result.current.completeAndContinue("step-2"));
      expect(mockNavigate).toHaveBeenCalled();
      const stored = JSON.parse(
        sessionStorage.getItem(`completedSteps_${FORM_ID}`) ?? "[]",
      );
      expect(stored).toContain("step-2");
    });

    it("does not navigate when completing the last step (no next step)", () => {
      markComplete(FORM_ID, "step-1", "step-2");
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-3",
        }),
      );
      mockNavigate.mockClear();
      act(() => result.current.completeAndContinue("step-3"));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("uses stepsOverride to determine the next step (navigates to override[next] not activeSteps[next])", () => {
      // activeSteps next after step-2 would be step-3; the override puts
      // step-new in that slot. Asserting the destination distinguishes
      // override-used from override-ignored — toHaveBeenCalled would
      // pass in either case.
      markComplete(FORM_ID, "step-1");
      const extraSteps = [step("step-1"), step("step-2"), step("step-new")];
      const { result } = renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "step-2",
        }),
      );
      mockNavigate.mockClear();
      act(() => result.current.completeAndContinue("step-2", extraSteps));
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      const searchFn = (
        mockNavigate.mock.calls[0][0] as {
          search: (p: Record<string, unknown>) => Record<string, unknown>;
        }
      ).search;
      expect(searchFn({})).toEqual(
        expect.objectContaining({ step: "step-new" }),
      );
    });
  });

  describe("guard effect — rule 1 (no step in URL)", () => {
    it("navigates to the first incomplete step when currentStepId is empty", () => {
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "",
        }),
      );
      expect(mockNavigate).toHaveBeenCalled();
    });

    it("navigates to last step when all steps are completed and no currentStepId", () => {
      markComplete(FORM_ID, "step-1", "step-2", "step-3");
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: steps,
          currentStepId: "",
        }),
      );
      expect(mockNavigate).toHaveBeenCalled();
    });

    it("does nothing when activeSteps is empty", () => {
      renderHook(() =>
        useStepGuard({
          formId: FORM_ID,
          activeSteps: [],
          currentStepId: "",
        }),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
