import { createHmac, randomBytes } from "node:crypto";
import { verifySlackSignature } from "./slack-signature";

// Random per run: a throwaway key for signing test requests, not a credential.
const SECRET = randomBytes(16).toString("hex");
const NOW = 1_800_000_000;
const BODY = "command=%2Fstats&text=week";
const sign = (ts: number, body = BODY, secret = SECRET) =>
  "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex");

const verify = (
  overrides: Partial<Parameters<typeof verifySlackSignature>[0]>,
) =>
  verifySlackSignature({
    secret: SECRET,
    timestamp: String(NOW),
    rawBody: BODY,
    signature: sign(NOW),
    nowSeconds: NOW,
    ...overrides,
  });

describe("verifySlackSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verify({})).toBe(true);
  });

  it("refuses a tampered body", () => {
    expect(verify({ rawBody: BODY + "&x=1" })).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    expect(verify({ signature: sign(NOW, BODY, "other") })).toBe(false);
  });

  it("refuses a request older than 5 minutes", () => {
    const old = NOW - 301;
    expect(verify({ timestamp: String(old), signature: sign(old) })).toBe(
      false,
    );
  });

  it("refuses when the secret, timestamp or signature is missing", () => {
    expect(verify({ secret: "" })).toBe(false);
    expect(verify({ timestamp: undefined })).toBe(false);
    expect(verify({ signature: undefined })).toBe(false);
  });

  it("refuses a non-numeric timestamp", () => {
    expect(verify({ timestamp: "soon" })).toBe(false);
  });
});
