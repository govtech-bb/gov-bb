import { ZodError } from "zod";

/**
 * An error carrying an explicit HTTP status. Handlers throw this (directly or
 * via the `badRequest`/`notFound` shorthands) instead of writing a status +
 * body themselves; the terminal `errorHandler` maps it to that status with a
 * bare `{ error }` body.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string): HttpError =>
  new HttpError(400, message);

export const notFound = (message: string): HttpError =>
  new HttpError(404, message);

/**
 * Render a ZodError as the `"path: message; …"` string the API has always
 * returned, replacing the copies that lived in forms.ts and mda-contacts.ts.
 * `fallbackLabel` names the field when an issue has an empty path (a top-level
 * type error), matching the per-site labels the inline formatters used.
 */
export function formatZodError(
  error: ZodError,
  fallbackLabel = "value",
): string {
  return error.issues
    .map(
      (issue) => `${issue.path.join(".") || fallbackLabel}: ${issue.message}`,
    )
    .join("; ");
}
