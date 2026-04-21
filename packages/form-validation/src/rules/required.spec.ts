import { requiredRunner } from "./required";

const cfg = (error?: string) => ({ error });

describe("requiredRunner", () => {
  it("passes a non-empty string", () => {
    expect(requiredRunner("hello", cfg(), {})).toBeNull();
  });

  it("fails an empty string", () => {
    expect(requiredRunner("", cfg(), {})).toBe("This field is required");
  });

  it("fails a whitespace-only string", () => {
    expect(requiredRunner("   ", cfg(), {})).toBe("This field is required");
  });

  it("fails null", () => {
    expect(requiredRunner(null, cfg(), {})).toBe("This field is required");
  });

  it("fails undefined", () => {
    expect(requiredRunner(undefined, cfg(), {})).toBe("This field is required");
  });

  it("fails an empty array", () => {
    expect(requiredRunner([], cfg(), {})).toBe("This field is required");
  });

  it("passes a non-empty array", () => {
    expect(requiredRunner(["a"], cfg(), {})).toBeNull();
  });

  it("passes 0 (number zero is valid)", () => {
    expect(requiredRunner(0, cfg(), {})).toBeNull();
  });

  it("passes false (boolean false is valid)", () => {
    expect(requiredRunner(false, cfg(), {})).toBeNull();
  });

  it("uses custom error message", () => {
    expect(requiredRunner("", cfg("Custom error"), {})).toBe("Custom error");
  });
});
