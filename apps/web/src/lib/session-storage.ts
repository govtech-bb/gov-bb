import { FormValues } from "@web/types";

// Store form data in session storage
export function storeFormData(formId: string, data: FormValues) {
  sessionStorage.setItem(`formData_${formId}`, JSON.stringify(data));
}

// Retrieve form data from session storage
export function getFormData(formId: string) {
  const data = sessionStorage.getItem(`formData_${formId}`);
  return data ? JSON.parse(data) : null;
}

// Get completed steps from session storage
export function getCompletedSteps(formId: string): string[] {
  const steps = sessionStorage.getItem(`completedSteps_${formId}`);
  return steps ? JSON.parse(steps) : [];
}

// Mark a step as completed in session storage
export function markStepCompleted(formId: string, stepId: string) {
  const completedSteps = getCompletedSteps(formId);
  if (!completedSteps.includes(stepId)) {
    completedSteps.push(stepId);
    sessionStorage.setItem(
      `completedSteps_${formId}`,
      JSON.stringify(completedSteps),
    );
  }
}

// Check if a specific step is completed
export function isStepCompleted(formId: string, stepId: string): boolean {
  const completedSteps = getCompletedSteps(formId);
  return completedSteps.includes(stepId);
}

// Find the last completed step
export function getLastCompletedStep(
  formId: string,
  steps: { stepId: string }[],
): string | null {
  const completedSteps = getCompletedSteps(formId);
  for (let i = steps.length - 1; i >= 0; i--) {
    if (completedSteps.includes(steps[i].stepId)) {
      return steps[i].stepId;
    }
  }
  return null;
}

// Find the index of the first incomplete step
export function getFirstIncompleteStepIndex(
  formId: string,
  steps: { stepId: string }[],
): number {
  const completedSteps = getCompletedSteps(formId);
  for (let i = 0; i < steps.length; i++) {
    if (!completedSteps.includes(steps[i].stepId)) {
      return i;
    }
  }
  return steps.length; // all steps completed
}
