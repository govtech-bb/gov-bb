import { ApiFailure } from "./client";

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

  if (error.errors.length === 0) return [otherwise];

  return error.errors.map((item) => `${label(item.field)}: ${item.message}`);
}
