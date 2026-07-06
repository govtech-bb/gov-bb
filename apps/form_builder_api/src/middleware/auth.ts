import type { Request, Response, NextFunction } from "express";
import { resolveTokenAuth } from "./resolve-token-auth";

const ADMIN_TOKEN_HEADER = "x-admin-token";

/**
 * Gates /builder/* on the shared X-Admin-Token, using the one dev-bypass policy
 * shared with apps/api's AdminTokenGuard (ADR 0061): token unset + prod → 500,
 * token unset + non-prod → passthrough, token set → must match. The 401
 * (missing header) vs 403 (wrong token) split is an Express-adapter concern, so
 * it stays here.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const presented = req.headers[ADMIN_TOKEN_HEADER] as string | undefined;
  const decision = resolveTokenAuth({
    presented,
    expected: process.env.ADMIN_API_TOKEN,
    isProd: process.env.NODE_ENV === "production",
  });

  switch (decision) {
    case "ok":
    case "passthrough":
      next();
      return;
    case "misconfigured":
      res
        .status(500)
        .json({ error: "Server misconfigured: ADMIN_API_TOKEN required" });
      return;
    case "denied":
      if (!presented) {
        res.status(401).json({ error: "Missing X-Admin-Token header" });
      } else {
        res.status(403).json({ error: "Invalid admin token" });
      }
      return;
  }
}
