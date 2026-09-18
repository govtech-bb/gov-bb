import { eventName, stepNumberToWord } from "@govtech-bb/analytics";

/** "<form>:form-step-<word>" for the completed step (0-based index in), capped
 *  to Umami's 50-char event-name limit (long-id forms fall back to `s<n>`). */
export function stepCompleteEventName(
  formId: string,
  stepIndex: number,
): string {
  return eventName(formId, `form-step-${stepNumberToWord(stepIndex + 1)}`);
}
