import { currency } from "./currency";

describe("currency", () => {
  it("formats a number with the given currency code", () => {
    const formatted = currency(50, "BBD");
    expect(formatted).toMatch(/50/);
    expect(formatted).toMatch(/BBD|\$/);
  });

  it("defaults to BBD when no code given", () => {
    expect(currency(100, undefined)).toMatch(/100/);
  });

  // #1826 — a blank form field stores "", which used to reach Intl.NumberFormat
  // and throw RangeError, crashing config resolution. Empty/whitespace codes must
  // degrade to BBD, exactly like a missing code.
  it("falls back to BBD for an empty-string code", () => {
    expect(() => currency(50, "")).not.toThrow();
    expect(currency(50, "")).toBe(currency(50, "BBD"));
  });

  it("falls back to BBD for a whitespace-only code", () => {
    expect(() => currency(50, "   ")).not.toThrow();
    expect(currency(50, "   ")).toBe(currency(50, "BBD"));
  });

  it("falls back to BBD for an undefined code", () => {
    expect(currency(50, undefined)).toBe(currency(50, "BBD"));
  });

  // A malformed non-empty code (wrong length or non-alpha) is rejected by
  // Intl.NumberFormat with a RangeError. These must also degrade to BBD.
  it.each(["US", "USDD", "12", "$5"])(
    "falls back to BBD for a malformed code %j",
    (code) => {
      expect(() => currency(50, code)).not.toThrow();
      expect(currency(50, code)).toBe(currency(50, "BBD"));
    },
  );

  it("still formats a valid non-BBD code", () => {
    expect(currency(50, "USD")).toMatch(/50/);
    expect(currency(50, "USD")).not.toBe(currency(50, "BBD"));
  });
});
