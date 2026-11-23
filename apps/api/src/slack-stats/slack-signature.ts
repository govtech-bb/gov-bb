import { createHmac, timingSafeEqual } from "node:crypto";

/** Slack's replay window: refuse requests stamped more than 5 minutes off. */
const MAX_AGE_SECONDS = 5 * 60;

/**
 * Verify a Slack request signature (`X-Slack-Signature`) over the raw body,
 * per https://api.slack.com/authentication/verifying-requests-from-slack.
 * An empty secret never verifies, so an unconfigured env fails closed.
 */
export function verifySlackSignature({
  secret,
  timestamp,
  rawBody,
  signature,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  secret: string;
  timestamp: string | undefined;
  rawBody: string;
  signature: string | undefined;
  nowSeconds?: number;
}): boolean {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > MAX_AGE_SECONDS) {
    return false;
  }
  const expected =
    "v0=" +
    createHmac("sha256", secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
