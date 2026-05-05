import { verifyEzpaySignature } from "./ezpay-signature";
import { createHmac } from "node:crypto";

describe("verifyEzpaySignature", () => {
  const secret = "shhh";
  const body = '{"_status":"Success"}';
  const correct = createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a correct HMAC-SHA256 signature", () => {
    expect(verifyEzpaySignature(body, correct, secret)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(verifyEzpaySignature(body, "deadbeef", secret)).toBe(false);
  });

  it("rejects when secret is empty (fail-closed)", () => {
    expect(verifyEzpaySignature(body, correct, "")).toBe(false);
  });

  it("rejects when signature header is missing", () => {
    expect(verifyEzpaySignature(body, "", secret)).toBe(false);
  });
});
