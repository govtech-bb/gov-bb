import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const ADMIN_TOKEN_HEADER = "x-admin-token";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.ADMIN_API_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  if (!expected) {
    if (isProd) {
      res
        .status(500)
        .json({ error: "Server misconfigured: ADMIN_API_TOKEN required" });
      return;
    }
    // Dev passthrough
    next();
    return;
  }

  const presented = req.headers[ADMIN_TOKEN_HEADER] as string | undefined;
  if (!presented) {
    res.status(401).json({ error: "Missing X-Admin-Token header" });
    return;
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(403).json({ error: "Invalid admin token" });
    return;
  }

  next();
}
