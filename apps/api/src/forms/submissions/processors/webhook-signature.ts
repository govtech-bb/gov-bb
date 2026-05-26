import { createHmac } from "crypto";

/**
 * Sign a webhook request body with HMAC-SHA256.
 *
 * The signature MUST be computed over the exact serialized string that becomes
 * the HTTP request body — the receiver re-signs the bytes it received and
 * compares. Returns a `sha256=<hex>` string (Stripe/GitHub convention).
 */
export function sign(rawBody: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}
