/** What the editor once stored for a message nobody had written, whatever the question asked. */
const placeholders = new Set([
  "Enter an answer",
  "Enter a valid answer",
  "Enter a date in the permitted range",
]);

/**
 * Whether a stored error message is the author's own. A blank one, or one of the old placeholders that saved drafts
 * still hold, means none was written: the message is then the default, worded from the question's current label.
 */
export const isAuthoredMessage = (message: string) =>
  !!message.trim() && !placeholders.has(message);

/** Keys used by the existing editable validation-message controls and saved drafts. */
export type ValidationMessageKey =
  | "required"
  | "minLength"
  | "maxLength"
  | "min"
  | "max"
  | "email"
  | "phone"
  | "before"
  | "after"
  | "onOrAfter"
  | "onOrBefore"
  | "minSelection"
  | "maxSelection"
  | "minItems"
  | "maxItems"
  | "fileTypes"
  | "itemMaxSize"
  | "past"
  | "pastOrToday"
  | "future"
  | "futureOrToday"
  | "pattern";
