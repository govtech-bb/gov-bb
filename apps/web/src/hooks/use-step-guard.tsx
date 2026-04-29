import { useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FormMeta, FormValues, UseStepGuardProps } from "@web/types";
import {
  getFirstIncompleteStepIndex,
  markStepCompleted,
  storeFormData,
} from "../lib/session-storage";

export function useStepGuard({
  formId,
  steps,
  stepId,
  setStepIndex,
}: UseStepGuardProps) {
  const navigate = useNavigate({ from: "/forms/$formId/" });

  const getSafeStepIndex = (requestedIndex: number) => {
    const maxAllowed = getFirstIncompleteStepIndex(formId, steps);
    return Math.min(Math.max(requestedIndex, 0), maxAllowed);
  };

  const navigateToStep = useCallback(
    (requestedIndex: number) => {
      const maxAllowed = getFirstIncompleteStepIndex(formId, steps);
      const safeIndex = Math.min(Math.max(requestedIndex, 0), maxAllowed);

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
    [formId, steps, navigate, setStepIndex],
  );

  const completeAndContinue = (
    currentStepId: string,
    currentIndex: number,
    formValues: FormValues,
  ) => {
    markStepCompleted(formId, currentStepId);
    storeFormData(formId, formValues);
    navigateToStep(currentIndex + 1);
  };

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
  }, [stepId, steps, navigateToStep, setStepIndex]);

  return {
    navigateToStep,
    completeAndContinue,
    getSafeStepIndex,
  };
}
