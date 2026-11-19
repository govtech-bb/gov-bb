import type { NestExpressApplication } from "@nestjs/platform-express";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

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
  // The express.json this replaced (express 4) always left req.body as {};
  // Nest's parsers (body-parser 2) leave it undefined when they don't parse
  // the request, which turned e.g. a text/plain webhook into a 500. Keep {}.
  // Nest's urlencoded parser, registered later at init, still overwrites it.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.body ??= {};
    next();
  });
  // navigator.sendBeacon posts journey events as text/plain (no CORS preflight,
  // survives page unload); JourneyService parses the JSON itself.
  app.use("/journey", express.text({ type: "text/plain", limit: "64kb" }));
}
