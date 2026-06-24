/**
 * Step values keyed by stepId. Repeatable steps are arrays of instance
 * objects; non-repeatable steps are a single instance object. This is the
 * browser↔backend wire shape for `POST /submissions` — produced by the forms
 * UI and the chat assistant, consumed by apps/api.
 */
export type SubmissionValues = Record<
  string,
  Record<string, unknown> | Array<Record<string, unknown>>
>;
