import { useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UseStepGuardProps } from "../types/props.type";
import {
  getLastCompletedStep,
  markStepCompleted,
} from "../lib/session-storage";

export function useStepGuard({
  formId,
  steps,
  stepId,
  setStepIndex,
}: UseStepGuardProps) {
  const navigate = useNavigate({ from: "/forms/$formId/" });

  const findStepIndexById = useCallback(
    (id: string) => steps.findIndex((s) => s.stepId === id),
    [steps],
  );

  const getMaxAllowedStepIndex = useCallback(() => {
    const lastCompletedStepId = getLastCompletedStep(formId, steps);

    if (!lastCompletedStepId) return 0;

    const index = findStepIndexById(lastCompletedStepId);
    return index + 1;
  }, [formId, steps, findStepIndexById]);

  const getSafeStepIndex = useCallback(
    (requestedIndex: number) => {
      const maxAllowed = getMaxAllowedStepIndex();
      return Math.min(Math.max(requestedIndex, 0), maxAllowed);
    },
    [getMaxAllowedStepIndex],
  );

  const navigateToStep = useCallback(
    (requestedIndex: number) => {
      const safeIndex = getSafeStepIndex(requestedIndex);

      if (safeIndex >= steps.length) return;

      const nextStepId = steps[safeIndex].stepId;

      setStepIndex(safeIndex);

      void navigate({
        search: (prev) => ({
          ...prev,
          step: nextStepId,
        }),
      });
    },
    [getSafeStepIndex, steps, navigate, setStepIndex],
  );

  useEffect(() => {
    if (!stepId) {
      setStepIndex(0);
      return;
    }

    const requestedIndex = findStepIndexById(stepId);
    const safeIndex = getSafeStepIndex(
      requestedIndex >= 0 ? requestedIndex : 0,
    );

    setStepIndex(safeIndex);

    if (safeIndex !== requestedIndex) {
      navigateToStep(safeIndex);
    }
  }, [
    stepId,
    steps,
    findStepIndexById,
    getSafeStepIndex,
    navigateToStep,
    setStepIndex,
  ]);

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
