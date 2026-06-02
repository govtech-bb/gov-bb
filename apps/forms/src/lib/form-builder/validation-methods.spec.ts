/**
 * validation-methods.spec.ts
 *
 * Unit tests for the pure helpers that remain in validation-methods.ts after
 * field rule-checking moved to `@govtech-bb/form-validation`.
 *
 * Coverage:
 *  - valueIsEmpty: all FieldValue branches (string, boolean, number, array,
 *    DateValueInput, nullish, unknown)
 *  - dateValueToDate: complete, partial
 *  - isDateComplete: complete, partial
 *  - evaluateCondition: all operation branches (in/contains, equal,
 *    strictEquality, notEqual, exists, gt, lt, default)
 */

import {
  valueIsEmpty,
  dateValueToDate,
  isDateComplete,
  evaluateCondition,
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
// dateValueToDate
// ---------------------------------------------------------------------------

describe("dateValueToDate", () => {
  it("returns a Date for a complete DateValue", () => {
    const d = dateValueToDate({ day: 15, month: 6, year: 2024 });
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(5); // month is 0-indexed
    expect(d?.getDate()).toBe(15);
  });

  it("returns null when day is undefined", () => {
    expect(
      dateValueToDate({ day: undefined as never, month: 6, year: 2024 }),
    ).toBeNull();
  });

  it("returns null when month is undefined", () => {
    expect(
      dateValueToDate({ day: 15, month: undefined as never, year: 2024 }),
    ).toBeNull();
  });

  it("returns null when year is undefined", () => {
    expect(
      dateValueToDate({ day: 15, month: 6, year: undefined as never }),
    ).toBeNull();
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
// evaluateCondition
// ---------------------------------------------------------------------------

describe("evaluateCondition", () => {
  describe("in / contains", () => {
    it("returns true when string conditionValue includes the target string", () => {
      expect(evaluateCondition("hello world", "hello", "contains")).toBe(true);
    });

    it("returns true when array conditionValue includes the target value", () => {
      expect(evaluateCondition(["yes", "no"], "yes", "in")).toBe(true);
    });

    it("returns false when conditionValue does not include the target", () => {
      expect(evaluateCondition("hello", "xyz", "contains")).toBe(false);
    });

    it("returns false when conditionValue or targetFieldValue is falsy", () => {
      expect(evaluateCondition("", "yes", "contains")).toBe(false);
      expect(evaluateCondition("hello", undefined, "contains")).toBe(false);
    });

    it("returns false when target is not string/boolean/number", () => {
      // array as target
      expect(evaluateCondition("abc", ["a", "b"] as never, "in")).toBe(false);
    });
  });

  describe("equal", () => {
    it("returns true for case-insensitive string match", () => {
      expect(evaluateCondition("Hello", "hello", "equal")).toBe(true);
    });

    it("returns true for exact numeric match via ==", () => {
      expect(evaluateCondition(42, 42, "equal")).toBe(true);
    });

    it("returns false when values are different", () => {
      expect(evaluateCondition("yes", "no", "equal")).toBe(false);
    });

    it("returns false when either value is falsy", () => {
      expect(evaluateCondition("", "yes", "equal")).toBe(false);
      expect(evaluateCondition("yes", undefined, "equal")).toBe(false);
    });
  });

  describe("strictEquality", () => {
    it("returns true for strictly equal values", () => {
      expect(evaluateCondition("yes", "yes", "strictEquality")).toBe(true);
    });

    it("returns false when values are loosely equal but not strictly", () => {
      // 1 == true but 1 !== true
      expect(
        evaluateCondition(1 as never, true as never, "strictEquality"),
      ).toBe(false);
    });

    it("returns false when either value is falsy", () => {
      expect(evaluateCondition("", "yes", "strictEquality")).toBe(false);
    });
  });

  describe("notEqual", () => {
    it("returns true when values are different", () => {
      expect(evaluateCondition("yes", "no", "notEqual")).toBe(true);
    });

    it("returns false when values are equal", () => {
      expect(evaluateCondition("yes", "yes", "notEqual")).toBe(false);
    });

    it("returns false when conditionValue is falsy", () => {
      expect(evaluateCondition("", "anything", "notEqual")).toBe(false);
    });
  });

  describe("exists", () => {
    it("returns true when targetFieldValue is a non-empty string", () => {
      expect(evaluateCondition("anything", "populated", "exists")).toBe(true);
    });

    it("returns false when targetFieldValue is empty string", () => {
      expect(evaluateCondition("anything", "", "exists")).toBe(false);
    });

    it("returns false when targetFieldValue is undefined", () => {
      expect(evaluateCondition("anything", undefined, "exists")).toBe(false);
    });
  });

  describe("gt", () => {
    it("returns true when conditionValue is greater than target", () => {
      expect(evaluateCondition(10, 5, "gt")).toBe(true);
    });

    it("returns false when conditionValue equals target", () => {
      expect(evaluateCondition(5, 5, "gt")).toBe(false);
    });

    it("returns false when conditionValue is less than target", () => {
      expect(evaluateCondition(3, 5, "gt")).toBe(false);
    });

    it("returns false when either value is non-numeric", () => {
      expect(evaluateCondition("abc", 5, "gt")).toBe(false);
      expect(evaluateCondition(5, "abc", "gt")).toBe(false);
    });

    it("returns true when conditionValue > 0 and target is 0", () => {
      expect(evaluateCondition(5, 0, "gt")).toBe(true);
    });

    it("returns false when conditionValue is 0 and target is positive", () => {
      expect(evaluateCondition(0, 5, "gt")).toBe(false);
    });

    it("returns false when conditionValue is an empty/whitespace string", () => {
      expect(evaluateCondition("  ", 5, "gt")).toBe(false);
    });

    it("returns false when targetFieldValue is an empty/whitespace string", () => {
      expect(evaluateCondition(5, "  ", "gt")).toBe(false);
    });
  });

  describe("lt", () => {
    it("returns true when conditionValue is less than target", () => {
      expect(evaluateCondition(3, 5, "lt")).toBe(true);
    });

    it("returns false when conditionValue equals target", () => {
      expect(evaluateCondition(5, 5, "lt")).toBe(false);
    });

    it("returns false when conditionValue is greater than target", () => {
      expect(evaluateCondition(10, 5, "lt")).toBe(false);
    });

    it("returns false when either value is non-numeric", () => {
      expect(evaluateCondition("abc", 5, "lt")).toBe(false);
      expect(evaluateCondition(5, "abc", "lt")).toBe(false);
    });

    it("returns true when conditionValue is 0 and target is positive", () => {
      expect(evaluateCondition(0, 5, "lt")).toBe(true);
    });

    it("returns false when conditionValue > 0 and target is 0", () => {
      expect(evaluateCondition(5, 0, "lt")).toBe(false);
    });

    it("returns false when conditionValue is an empty/whitespace string", () => {
      expect(evaluateCondition("  ", 5, "lt")).toBe(false);
    });

    it("returns false when targetFieldValue is an empty/whitespace string", () => {
      expect(evaluateCondition(5, "  ", "lt")).toBe(false);
    });
  });

  describe("default (unknown operation)", () => {
    it("returns false for an unknown operation", () => {
      expect(evaluateCondition("a", "a", "unknownOp" as never)).toBe(false);
    });
  });
});
