import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";

/**
 * Request body parsers, shared by main.ts and the EzPay webhook wire test.
 *
 * JSON goes through Nest's `useBodyParser` so the raw bytes stay on
 * `req.rawBody` (the app is created with `rawBody: true`): the EzPay webhook
 * signature is an HMAC over those bytes. A plain `express.json()` here parses
 * the body first, Nest then skips its own JSON parser, and `rawBody` is never
 * set — so with EZPAY_WEBHOOK_VERIFY_SIGNATURE=true every JSON webhook failed
 * with a 500 (#3012).
 */
export function useBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: "1mb" });
  // navigator.sendBeacon posts journey events as text/plain (no CORS preflight,
  // survives page unload); JourneyService parses the JSON itself.
  app.use("/journey", express.text({ type: "text/plain", limit: "64kb" }));
}
