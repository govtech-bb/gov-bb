/**
 * validation-methods.spec.ts
 *
 * Unit tests for the pure helpers that remain in validation-methods.ts after
 * field rule-checking moved to `@govtech-bb/form-validation`.
 *
 * Coverage:
 *  - valueIsEmpty: all FieldValue branches (string, boolean, number, array,
 *    DateValueInput, nullish, unknown)
 *  - isDateComplete: complete, partial
 *
 * Conditional evaluation moved to `@govtech-bb/form-conditions` (#668); its
 * coverage lives in that package and at the migrated call sites
 * (`behavior-helper.spec.ts`, `validation-builder.spec.ts`).
 */

import {
  valueIsEmpty,
  isDateComplete,
  parseDatePart,
} from "./validation-methods";

// ---------------------------------------------------------------------------
// valueIsEmpty
// ---------------------------------------------------------------------------

describe("valueIsEmpty", () => {
  it("returns true for null-ish falsy values", () => {
    expect(valueIsEmpty(null as never)).toBe(true);
    expect(valueIsEmpty(undefined as never)).toBe(true);
    expect(valueIsEmpty("" as never)).toBe(true); // falsy catches empty string before typeof check
  });

  it("returns false for a non-empty string", () => {
    expect(valueIsEmpty("hello")).toBe(false);
  });

  it("returns false for a non-empty whitespace string (typeof string path)", () => {
    // The falsy guard catches "" before the typeof branch; this test exercises
    // the typeof === "string" path with a non-empty value where length > 0.
    expect(valueIsEmpty(" ")).toBe(false);
  });

  it("returns true for an empty array", () => {
    expect(valueIsEmpty([])).toBe(true);
  });

  it("returns false for a non-empty array", () => {
    expect(valueIsEmpty(["a"])).toBe(false);
  });

  it("returns false for boolean true", () => {
    expect(valueIsEmpty(true)).toBe(false);
  });

  it("returns true for boolean false", () => {
    expect(valueIsEmpty(false)).toBe(true);
  });

  it("returns false for a non-zero number", () => {
    expect(valueIsEmpty(42)).toBe(false);
  });

  it("returns true for DateValueInput that is incomplete", () => {
    expect(valueIsEmpty({ day: 1, month: 1 })).toBe(true);
  });

  it("returns false for a complete DateValueInput", () => {
    expect(valueIsEmpty({ day: 1, month: 1, year: 2024 })).toBe(false);
  });

  it("returns undefined for an unrecognised object shape", () => {
    expect(valueIsEmpty({ some: "object" } as never)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isDateComplete
// ---------------------------------------------------------------------------

describe("isDateComplete", () => {
  it("returns true when day, month, and year are all present", () => {
    expect(isDateComplete({ day: 1, month: 1, year: 2024 })).toBe(true);
  });

  it("returns false when day is missing", () => {
    expect(isDateComplete({ month: 1, year: 2024 })).toBe(false);
  });

  it("returns false when month is missing", () => {
    expect(isDateComplete({ day: 1, year: 2024 })).toBe(false);
  });

  it("returns false when year is missing", () => {
    expect(isDateComplete({ day: 1, month: 1 })).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isDateComplete({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseDatePart
// ---------------------------------------------------------------------------

describe("parseDatePart", () => {
  it("parses a numeric string to a number", () => {
    expect(parseDatePart("12")).toBe(12);
    expect(parseDatePart("2008")).toBe(2008);
  });

  it("returns undefined for an empty string (never 0)", () => {
    expect(parseDatePart("")).toBeUndefined();
  });

  it("returns undefined for non-numeric input (never NaN)", () => {
    expect(parseDatePart("abc")).toBeUndefined();
  });

  it("strips non-digit characters rather than producing NaN", () => {
    expect(parseDatePart("1a")).toBe(1);
    expect(parseDatePart("a1")).toBe(1);
    expect(parseDatePart("1.5")).toBe(15);
  });

  it("never returns NaN for any string input", () => {
    for (const input of ["", " ", "abc", "-", ".", "NaN", "1a", "e5"]) {
      const result = parseDatePart(input);
      expect(Number.isNaN(result)).toBe(false);
    }
  });
});
