import { useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UseStepGuardProps } from "../types/props.type";
import {
  getFirstIncompleteStepIndex,
  markStepCompleted,
} from "../lib/session-storage";

export function useStepGuard({
  formId,
  steps,
  stepId,
  setStepIndex,
}: UseStepGuardProps) {
  const navigate = useNavigate({ from: "/forms/$formId/" });

  const getSafeStepIndex = useCallback(
    (requestedIndex: number) => {
      const maxAllowed = getFirstIncompleteStepIndex(formId, steps);
      return Math.min(Math.max(requestedIndex, 0), maxAllowed);
    },
    [formId, steps],
  );

  const navigateToStep = useCallback(
    (requestedIndex: number) => {
      const safeIndex = getSafeStepIndex(requestedIndex);

      setStepIndex(safeIndex);

      // Only update route if within valid range
      if (safeIndex < steps.length) {
        const nextStepId = steps[safeIndex].stepId;

        void navigate({
          search: (prev) => ({
            ...prev,
            step: nextStepId,
          }),
        });
      }
    },
    [getSafeStepIndex, steps, navigate, setStepIndex],
  );

  useEffect(() => {
    if (!stepId) {
      navigateToStep(0);
      return;
    }

    const requestedIndex = steps.findIndex((s) => s.stepId === stepId);
    const safeIndex = getSafeStepIndex(
      requestedIndex >= 0 ? requestedIndex : 0,
    );

    setStepIndex(safeIndex);

    if (safeIndex !== requestedIndex) {
      navigateToStep(safeIndex);
    }
  }, [stepId, steps, getSafeStepIndex, navigateToStep, setStepIndex]);

  const completeAndContinue = useCallback(
    (currentStepId: string, currentIndex: number) => {
      markStepCompleted(formId, currentStepId);
      navigateToStep(currentIndex + 1);
    },
    [formId, navigateToStep],
  );

  return {
    navigateToStep,
    completeAndContinue,
    getSafeStepIndex,
  };
}
