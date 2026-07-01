import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError, formatZodError } from "../lib/http-error.js";

/**
 * The single terminal error handler for form_builder_api, registered after all
 * routers in app.ts. Express 5 forwards any thrown or rejected handler error
 * here, so handlers no longer hand-roll a `catch -> res.status(500)`. The body
 * stays a bare `{ error: string }` — the shape api-client's `ApiError` reads —
 * and the status is preserved:
 *   - ZodError      -> 400, formatted issues
 *   - HttpError     -> its explicit status
 *   - anything else -> 500, the error message
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // A handler that already began the response can't be rewritten; defer to
  // Express's default finalizer instead of throwing "headers already sent".
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: formatZodError(err) });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
};
