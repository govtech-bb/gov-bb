import { generatePaymentReference } from "./payment-reference";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generatePaymentReference", () => {
  it("returns a non-empty string", () => {
    expect(typeof generatePaymentReference()).toBe("string");
    expect(generatePaymentReference().length).toBeGreaterThan(0);
  });

  it("matches UUID v4 format", () => {
    expect(generatePaymentReference()).toMatch(UUID_V4_RE);
  });

  it("two successive calls produce distinct values", () => {
    expect(generatePaymentReference()).not.toBe(generatePaymentReference());
  });
});
