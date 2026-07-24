import { stepNumberToWord } from "@govtech-bb/analytics";

/** "<form>:form-step-<word>" for the completed step (0-based index in). */
export function stepCompleteEventName(
  formId: string,
  stepIndex: number,
): string {
  return `${formId}:form-step-${stepNumberToWord(stepIndex + 1)}`;
}
