import { FormValues, SubmissionState } from "../types";

function getStore(): Storage | null {
  return typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
    ? window.sessionStorage
    : null;
}

function stripNonSerializableValues(value: unknown): unknown {
  if (typeof File !== "undefined" && value instanceof File) {
    return undefined;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => stripNonSerializableValues(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value && typeof value === "object") {
    const entries: [string, unknown][] = [];

    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const sanitizedValue = stripNonSerializableValues(nestedValue);

      if (sanitizedValue !== undefined) {
        entries.push([key, sanitizedValue]);
      }
    }

    return Object.fromEntries(entries);
  }

  return value;
}

// Store form data in session storage
export function storeFormData(formId: string, data: FormValues) {
  const store = getStore();
  if (!store) return;
  store.setItem(
    `formData_${formId}`,
    JSON.stringify(stripNonSerializableValues(data)),
  );
}

// Retrieve form data from session storage
export function getFormData(formId: string) {
  const store = getStore();
  if (!store) return null;
  const data = store.getItem(`formData_${formId}`);
  return data ? JSON.parse(data) : null;
}

// Clear a form's persisted progress (field values + completed steps).
// Note: this deliberately does NOT touch the persisted submissionState — it is
// called on submit success, and the committed outcome must survive so a refresh
// on the confirmation step can still render it. See clearSubmissionState.
export function clearFormState(formId: string) {
  const store = getStore();
  if (!store) return;
  store.removeItem(`formData_${formId}`);
  store.removeItem(`completedSteps_${formId}`);
}

// The submission outcome lives in React state, which is lost on a browser
// refresh. Persisting it lets the confirmation step re-render after a reload
// instead of bouncing the citizen back to check-your-answers.
export function storeSubmissionState(formId: string, state: SubmissionState) {
  const store = getStore();
  if (!store) return;
  store.setItem(`submissionState_${formId}`, JSON.stringify(state));
}

export function getSubmissionState(formId: string): SubmissionState | null {
  const store = getStore();
  if (!store) return null;
  const raw = store.getItem(`submissionState_${formId}`);
  return raw ? JSON.parse(raw) : null;
}

export function clearSubmissionState(formId: string) {
  const store = getStore();
  if (!store) return;
  store.removeItem(`submissionState_${formId}`);
}

// Get completed steps from session storage
export function getCompletedSteps(formId: string): string[] {
  const store = getStore();
  if (!store) return [];
  const steps = store.getItem(`completedSteps_${formId}`);
  return steps ? JSON.parse(steps) : [];
}

// Mark a step as completed in session storage
export function markStepCompleted(formId: string, stepId: string) {
  const store = getStore();
  if (!store) return;
  const completedSteps = getCompletedSteps(formId);
  if (!completedSteps.includes(stepId)) {
    completedSteps.push(stepId);
    store.setItem(`completedSteps_${formId}`, JSON.stringify(completedSteps));
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

/**
 * Returns the first step in `activeSteps` that has not yet been completed.
 *
 * Only the steps currently visible (condition-filtered) are considered —
 * hidden steps are not blocking, regardless of their stored completion state.
 * Returns null when every active step is already completed.
 */
export function getFirstIncompleteActiveStep(
  formId: string,
  activeSteps: { stepId: string }[],
): { stepId: string } | null {
  const completedSteps = getCompletedSteps(formId);
  return activeSteps.find((s) => !completedSteps.includes(s.stepId)) ?? null;
}

// Duration tracking: stamp the start at form-start so form-submit can report
// elapsed seconds (legacy-parity duration_seconds).
export function persistFormStartTime(formId: string) {
  const store = getStore();
  if (!store) return;
  store.setItem(`formStart_${formId}`, String(Date.now()));
}

export function getFormStartTime(formId: string): number | null {
  const store = getStore();
  if (!store) return null;
  const raw = store.getItem(`formStart_${formId}`);
  return raw ? Number(raw) : null;
}

export function clearFormStartTime(formId: string) {
  const store = getStore();
  if (!store) return;
  store.removeItem(`formStart_${formId}`);
}

/**
 * Returns true when every step that precedes `targetStepId` inside
 * `activeSteps` has already been completed.
 *
 * This is the single source of truth for "can the user navigate here?":
 * - Step is not in activeSteps → false (hidden by condition, not reachable)
 * - Step is first in activeSteps → true (no prerequisites)
 * - All steps before it are completed → true
 * - Any step before it is incomplete → false
 */
export function isStepAccessible(
  formId: string,
  targetStepId: string,
  activeSteps: { stepId: string }[],
): boolean {
  const completedSteps = getCompletedSteps(formId);
  for (const step of activeSteps) {
    if (step.stepId === targetStepId) return true; // reached target: all preceding steps were complete
    if (!completedSteps.includes(step.stepId)) return false; // preceding step not complete
  }
  return false; // targetStepId not found in activeSteps
}
