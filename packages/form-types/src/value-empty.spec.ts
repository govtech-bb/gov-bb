import { describe, expect, it } from "vitest";
import { isDateComplete, valueIsEmpty } from "./value-empty";

describe("valueIsEmpty", () => {
  it("returns true for null-ish values and empty strings", () => {
    expect(valueIsEmpty(null as never)).toBe(true);
    expect(valueIsEmpty(undefined as never)).toBe(true);
    expect(valueIsEmpty("")).toBe(true);
  });

  it("returns false for a non-empty string", () => {
    expect(valueIsEmpty("hello")).toBe(false);
  });

  it("treats arrays by their length", () => {
    expect(valueIsEmpty([])).toBe(true);
    expect(valueIsEmpty(["a"])).toBe(false);
  });

  it("treats `false` as empty and `true` as non-empty", () => {
    expect(valueIsEmpty(false)).toBe(true);
    expect(valueIsEmpty(true)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(valueIsEmpty(42)).toBe(false);
  });

  it("delegates date objects to isDateComplete", () => {
    expect(valueIsEmpty({ day: "1", month: "1" })).toBe(true);
    expect(valueIsEmpty({ day: "1", month: "1", year: "2024" })).toBe(false);
  });

  it("returns undefined for an unrecognised object shape", () => {
    expect(valueIsEmpty({ some: "object" } as never)).toBeUndefined();
  });
});

describe("isDateComplete", () => {
  it("returns true only when day, month, and year are all present", () => {
    expect(isDateComplete({ day: "1", month: "1", year: "2024" })).toBe(true);
    expect(isDateComplete({ month: "1", year: "2024" })).toBe(false);
    expect(isDateComplete({ day: "1", year: "2024" })).toBe(false);
    expect(isDateComplete({ day: "1", month: "1" })).toBe(false);
  });

  it("treats an empty-string part as missing (#815)", () => {
    expect(isDateComplete({ day: "", month: "1", year: "2024" })).toBe(false);
    expect(isDateComplete({})).toBe(false);
  });
});
