import { createHmac } from "crypto";
import { sign } from "./webhook-signature";

describe("webhook-signature sign()", () => {
  const body = '{"event":"submission.created"}';
  const secret = "this-is-a-test-secret-key";

  it("returns the HMAC-SHA256 hex digest prefixed with sha256=", () => {
    const expected =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(sign(body, secret)).toBe(expected);
  });

  it("produces a stable digest for the same input", () => {
    expect(sign(body, secret)).toBe(sign(body, secret));
  });

  it("produces different digests for different bodies", () => {
    expect(sign(body, secret)).not.toBe(sign(body + " ", secret));
  });

  it("produces different digests for different secrets", () => {
    expect(sign(body, secret)).not.toBe(sign(body, secret + "x"));
  });
});
