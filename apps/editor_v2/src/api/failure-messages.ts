import { ApiFailure } from "./client";

/** The content API's own sentence for a refusal, or undefined when it sent none. */
export function apiMessage(error: ApiFailure): string | undefined {
  return error.message === new ApiFailure(error.status).message ? undefined : error.message;
}

/** API errors in the dialog's vocabulary; callers supply their own field labels. */
export function apiFailureMessages(
  error: Error | null,
  otherwise: string,
  label: (field: string) => string,
) {
  if (!error) return [];

  if (!(error instanceof ApiFailure) || error.status === 0)
    return ["The content API could not be reached. Try again."];

  if (error.status === 401) return ["Your session has ended. Sign in again, then try again."];

  // A refusal such as "Only approvers can…" says what the author can't do; trying again won't help
  if (error.status === 403 && error.errors.length === 0) return [apiMessage(error) ?? otherwise];

  if (error.errors.length === 0) return [otherwise];

  return error.errors.map((item) => `${label(item.field)}: ${item.message}`);
}
