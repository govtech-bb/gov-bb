import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ClientFormStep, UseStepGuardProps } from "@web/types";
import {
  getFirstIncompleteActiveStep,
  isStepAccessible,
  markStepCompleted,
} from "../lib/session-storage";
import {
  trackStepViewed,
  trackStepCompleted,
  trackStepBack,
} from "../lib/tracking";

/**
 * Condition-aware step guard for multi-step form navigation.
 *
 * Accessibility rules enforced on every render:
 *  1. No step ID in URL            → redirect to first incomplete active step.
 *  2. Step ID not in activeSteps   → step was hidden by a condition change;
 *                                    redirect to first incomplete active step.
 *  3. Step ID in activeSteps but a
 *     preceding step is incomplete → URL manipulation / direct link;
 *                                    redirect to first incomplete active step.
 *  4. All preceding steps complete → user may stay on the requested step.
 *
 * Hidden/conditional steps are fully excluded from accessibility checks —
 * their completion records in session storage are retained but never used
 * to block or allow navigation while the step is not in activeSteps.
 */
export function useStepGuard({
  formId,
  formVersion,
  activeSteps,
  currentStepId,
}: UseStepGuardProps) {
  const navigate = useNavigate({ from: "/forms/$formId/" });

  // Timing ref for the step currently being viewed. Set when step_viewed
  // fires, read (and reset) when step_completed or step_back fires.
  const stepStartedAtRef = useRef<number | null>(null);
  const trackedStepIdRef = useRef<string | null>(null);

  // ─── Internal primitive: write the step ID into the URL ──────────────────
  const navigateToStepId = useCallback(
    (stepId: string) => {
      void navigate({
        search: (prev: Record<string, unknown>) => ({ ...prev, step: stepId }),
      });
    },
    [navigate],
  );

  // ─── Safe navigation by step ID ──────────────────────────────────────────
  /**
   * Navigate to `targetStepId` if it is accessible, otherwise redirect to
   * the first incomplete active step.
   *
   * @param targetStepId  The step the caller wants to navigate to.
   * @param stepsOverride Optional updated steps list — pass when the caller
   *                      has already computed a future version of activeSteps
   *                      (e.g. after inserting a repeatable step) so the check
   *                      runs against the correct set rather than the stale
   *                      memoised list.
   */
  const navigateToStep = useCallback(
    (targetStepId: string, stepsOverride?: ClientFormStep[]) => {
      const steps = stepsOverride ?? activeSteps;
      if (isStepAccessible(formId, targetStepId, steps)) {
        navigateToStepId(targetStepId);
        return;
      }
      // Target is not accessible — land on the first step the user still owes.
      const fallback =
        getFirstIncompleteActiveStep(formId, steps) ??
        steps[steps.length - 1] ??
        steps[0];
      if (fallback) navigateToStepId(fallback.stepId);
    },
    [formId, activeSteps, navigateToStepId],
  );

  // ─── Mark complete and advance to the next active step ───────────────────
  /**
   * Record `completedStepId` as done, then navigate to the immediately
   * following step in `stepsOverride ?? activeSteps`.
   *
   * @param completedStepId  The step the user just finished.
   * @param stepsOverride    Future-state steps list (same semantics as in
   *                         `navigateToStep`).
   */
  const completeAndContinue = useCallback(
    (completedStepId: string, stepsOverride?: ClientFormStep[]) => {
      // TODO: Validate current step before marking as completed and navigating to the next step
      const steps = stepsOverride ?? activeSteps;
      const currentIdx = steps.findIndex((s) => s.stepId === completedStepId);

      if (
        stepStartedAtRef.current !== null &&
        trackedStepIdRef.current === completedStepId
      ) {
        const durationMs = Math.round(
          performance.now() - stepStartedAtRef.current,
        );
        trackStepCompleted(
          formId,
          formVersion,
          completedStepId,
          currentIdx,
          durationMs,
        );
        stepStartedAtRef.current = null;
        trackedStepIdRef.current = null;
      }

      markStepCompleted(formId, completedStepId);
      const nextStep = steps[currentIdx + 1];
      if (nextStep) navigateToStepId(nextStep.stepId);
    },
    [formId, formVersion, activeSteps, navigateToStepId],
  );

  // ─── Back navigation with tracking ───────────────────────────────────────
  /**
   * Navigate to `toStepId` from `fromStepId`, firing a `step_back` event.
   * Use this instead of `navigateToStep` whenever the user is going backwards
   * (e.g. via a Previous button) so the funnel can distinguish forward
   * progression from back navigation.
   */
  const goBack = useCallback(
    (fromStepId: string, toStepId: string) => {
      trackStepBack(formId, formVersion, fromStepId, toStepId);
      stepStartedAtRef.current = null;
      trackedStepIdRef.current = null;
      navigateToStep(toStepId);
    },
    [formId, formVersion, navigateToStep],
  );

  // ─── Guard effect: enforce access rules on every relevant change ─────────
  useEffect(() => {
    if (activeSteps.length === 0) return;

    // Rule 1 — no step in URL
    if (!currentStepId) {
      const target =
        getFirstIncompleteActiveStep(formId, activeSteps) ??
        activeSteps[activeSteps.length - 1];
      navigateToStepId(target.stepId);
      return;
    }

    const stepIsActive = activeSteps.some((s) => s.stepId === currentStepId);

    // Rule 2 — step was hidden by a condition change
    if (!stepIsActive) {
      const target =
        getFirstIncompleteActiveStep(formId, activeSteps) ??
        activeSteps[activeSteps.length - 1];
      navigateToStepId(target.stepId);
      return;
    }

    // Rule 3 — step exists but is not yet reachable (URL manipulation)
    if (!isStepAccessible(formId, currentStepId, activeSteps)) {
      const target =
        getFirstIncompleteActiveStep(formId, activeSteps) ?? activeSteps[0];
      navigateToStepId(target.stepId);
    }
    // Rule 4 — all checks passed: user is on a valid, accessible step
  }, [currentStepId, activeSteps, formId, navigateToStepId]);

  // ─── Derived index — stable when URL and activeSteps are in sync ─────────
  /**
   * Index of currentStepId inside activeSteps.
   * Will be -1 during the brief moment before the guard effect redirects away
   * from a step that was conditionally removed — callers should guard against
   * this: `Math.max(0, currentIndex)`.
   */
  const currentIndex = activeSteps.findIndex((s) => s.stepId === currentStepId);

  // ─── step_viewed tracking ────────────────────────────────────────────────
  // Fires once per landing on a valid, accessible step. The guard effect above
  // will have redirected away from any inaccessible step before this runs.
  useEffect(() => {
    if (!currentStepId) return;
    if (currentIndex === -1) return;
    if (!isStepAccessible(formId, currentStepId, activeSteps)) return;
    if (trackedStepIdRef.current === currentStepId) return;

    trackedStepIdRef.current = currentStepId;
    stepStartedAtRef.current = performance.now();
    trackStepViewed(formId, formVersion, currentStepId, currentIndex);
  }, [currentStepId, currentIndex, activeSteps, formId, formVersion]);

  return {
    navigateToStep,
    completeAndContinue,
    goBack,
    currentIndex,
  };
}
