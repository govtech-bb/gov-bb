import { phoneRunner } from "./phone";

const cfg = (value?: unknown, error?: string) => ({ value, error });

describe("phoneRunner", () => {
  it("passes a local Barbados number in various formats", () => {
    for (const n of [
      "246-418-1234",
      "4181234", // bare 7-digit local
      "246 250 1234",
      "(246) 418-1234",
      "2464181234",
    ]) {
      expect(phoneRunner(n, cfg(true), {})).toBeNull();
    }
  });

  it("accepts an international number when prefixed with +", () => {
    // A leading "+" overrides the BB default so the diaspora can apply.
    expect(phoneRunner("+447911123456", cfg(true), {})).toBeNull();
    expect(phoneRunner("+14165550123", cfg(true), {})).toBeNull();
  });

  it("rejects an out-of-range or malformed number", () => {
    for (const n of ["abc", "1234567890", "246-555-0100", "123"]) {
      expect(phoneRunner(n, cfg(true), {})).toBe(
        "Please enter a valid phone number",
      );
    }
  });

  it("uses custom error", () => {
    expect(phoneRunner("nope", cfg(true, "Enter a valid fax number"), {})).toBe(
      "Enter a valid fax number",
    );
  });

  it("validates each element of a multi-value field independently", () => {
    expect(phoneRunner(["246-418-1234", "4181234"], cfg(true), {})).toBeNull();
    // a blank element is treated as absent, not a violation
    expect(phoneRunner(["246-418-1234", ""], cfg(true), {})).toBeNull();
    expect(phoneRunner(["246-418-1234", "abc"], cfg(true), {})).toBe(
      "Please enter a valid phone number",
    );
  });
});
