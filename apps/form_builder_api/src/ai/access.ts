import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { RequestHandler, ErrorRequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";

const devKey = randomBytes(32).toString("hex");
const claimsSchema = z.object({
  purpose: z.enum(["chat", "upload", "document"]),
  subject: z.string().min(1).max(200),
  origin: z.string().url(),
  expires: z.number().int(),
  resource: z.string().max(1000).optional(),
});
type Claims = z.infer<typeof claimsSchema>;

function signature(payload: string): Buffer {
  const key =
    process.env.ADMIN_API_TOKEN ??
    (process.env.NODE_ENV !== "production" ? devKey : undefined);
  if (!key) throw new HttpError(503, "AI authentication is not configured.");
  return createHmac("sha256", key)
    .update("builder-ai-v1:" + payload)
    .digest();
}

export function issueAiToken(
  claims: Omit<Claims, "expires">,
  lifetimeSeconds = 60,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...claims,
      expires: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    }),
  ).toString("base64url");
  return payload + "." + signature(payload).toString("base64url");
}

export function verifyAiToken(
  token: string,
  purpose: Claims["purpose"],
): Claims {
  try {
    if (token.length > 4000) throw new Error();
    const [payload, mac, extra] = token.split(".");
    if (!payload || !mac || extra) throw new Error();
    const expected = signature(payload);
    const received = Buffer.from(mac, "base64url");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new Error();
    const claims = claimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    );
    if (
      claims.purpose !== purpose ||
      claims.expires <= Math.floor(Date.now() / 1000)
    )
      throw new Error();
    return claims;
  } catch {
    throw new HttpError(401, "This AI session expired. Retry to reconnect.");
  }
}

export function allowedAiOrigin(origin: string): boolean {
  const configured =
    process.env.CORS_ORIGIN?.split(",").map((item) => item.trim()) ?? [];
  if (configured.includes(origin)) return true;
  if (process.env.NODE_ENV === "production") return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(origin).hostname,
    );
  } catch {
    return false;
  }
}

export const aiAccessHandler: RequestHandler = (req, res) => {
  const { subject, origin } = z
    .object({ subject: z.string().min(1).max(200), origin: z.string().url() })
    .parse(req.body);
  if (!allowedAiOrigin(origin))
    throw new HttpError(403, "This editor origin is not allowed.");
  res.setHeader("Cache-Control", "no-store");
  res.json({ token: issueAiToken({ purpose: "chat", subject, origin }) });
};

export const requireAiAccess: RequestHandler = (req, res, next) => {
  const claims = verifyAiToken(
    req.headers.authorization?.replace(/^Bearer /, "") ?? "",
    "chat",
  );
  if (!allowedAiOrigin(claims.origin) || req.headers.origin !== claims.origin)
    throw new HttpError(403, "This editor origin is not allowed.");
  res.locals.ai = claims;
  next();
};

export function documentResource(
  reference: string,
  subject: string,
  purpose: "upload" | "document",
): string {
  const claims = verifyAiToken(reference, purpose);
  if (claims.subject !== subject || !claims.resource)
    throw new HttpError(403, "This document belongs to another session.");
  return claims.resource;
}

export const aiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (
    error instanceof HttpError ||
    error instanceof z.ZodError ||
    res.headersSent
  ) {
    next(error);
    return;
  }
  console.warn("[builder-ai]", { outcome: "service-error" });
  res.status(503).json({
    error: "The AI service could not complete this request. Retry in a moment.",
  });
};
