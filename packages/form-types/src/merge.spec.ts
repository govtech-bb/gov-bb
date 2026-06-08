import { shallowMergeDefined } from "./merge";

// Mirrors real callers (ValidationRule, PrimitiveUI): both sides share one
// type whose keys are optional, so an override can restate a subset.
type Hints = { a?: number; b?: number; c?: number };

describe("shallowMergeDefined", () => {
  it("returns undefined when both base and override are absent", () => {
    expect(shallowMergeDefined<Hints>(undefined, undefined)).toBeUndefined();
  });

  it("returns the base when only the base is present", () => {
    const base: Hints = { a: 1 };
    expect(shallowMergeDefined(base, undefined)).toBe(base);
  });

  it("returns the override when only the override is present", () => {
    const override: Hints = { a: 1 };
    expect(shallowMergeDefined(undefined, override)).toBe(override);
  });

  it("merges both, with override keys winning over base keys", () => {
    const base: Hints = { a: 1, b: 2 };
    const override: Hints = { b: 3, c: 4 };
    expect(shallowMergeDefined(base, override)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("returns a single present side by reference (no clone)", () => {
    const base: Hints = { a: 1 };
    const override: Hints = { a: 1 };
    expect(shallowMergeDefined(base, undefined)).toBe(base);
    expect(shallowMergeDefined(undefined, override)).toBe(override);
  });

  it("returns a fresh object when both sides are present (does not mutate either)", () => {
    const base: Hints = { a: 1 };
    const override: Hints = { b: 2 };
    const result = shallowMergeDefined(base, override);
    expect(result).not.toBe(base);
    expect(result).not.toBe(override);
    expect(base).toEqual({ a: 1 });
    expect(override).toEqual({ b: 2 });
  });
});
