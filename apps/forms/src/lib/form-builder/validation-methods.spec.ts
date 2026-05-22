/**
 * validation-methods.spec.ts
 *
 * Unit tests for the pure validation helper functions in validation-methods.ts.
 *
 * Coverage:
 *  - valueIsEmpty: all FieldValue branches (string, boolean, number, array, DateValueInput, nullish)
 *  - checkRequired: requiredAndEmpty / notRequiredAndEmpty / notEmpty / unknownState
 *  - checkLength: minLength, maxLength, no-op paths
 *  - checkSelectionLength: minSelection, maxSelection, no-op paths
 *  - checkPattern: match, no-match, missing validation
 *  - checkEmail: valid, invalid, missing validation
 *  - checkMinMax: numeric string, number, NaN, min/max boundaries
 *  - dateValueToDate: complete, partial
 *  - isDateComplete: complete, partial
 *  - checkDatePast: past date passes, today/future fails
 *  - checkDatePastOrToday: past/today passes, future fails
 *  - checkDateFuture: future passes, today/past fails
 *  - checkDateFutureOrToday: future/today passes, past fails
 *  - checkDateAfter: after target passes, on/before fails, bad string, no config
 *  - checkDateBefore: before target passes, on/after fails, bad string, no config
 *  - checkDateOnOrAfter: on/after target passes, before fails, bad string, no config
 *  - checkDateOnOrBefore: on/before target passes, after fails, bad string, no config
 *  - checkMinYear: below, at, above min; no config
 *  - checkMaxYear: above, at, below max; no config
 *  - evaluateCondition: all operation branches (in/contains, equal, strictEquality, notEqual, exists, gt, lt, default)
 *  - checkContains: passes, fails, missing validation
 *  - checkFileTypes: allowed, disallowed, empty list, no config
 *  - checkFileMaxSize: itemMaxSize, maxSize, both, no config
 *  - checkMaxFiles: over limit, at limit, no config
 *  - checkMinFiles: under limit, at limit, no config
 */

import {
  valueIsEmpty,
  checkRequired,
  checkLength,
  checkSelectionLength,
  checkPattern,
  checkEmail,
  checkMinMax,
  dateValueToDate,
  isDateComplete,
  checkDatePast,
  checkDatePastOrToday,
  checkDateFuture,
  checkDateFutureOrToday,
  checkDateAfter,
  checkDateBefore,
  checkDateOnOrAfter,
  checkDateOnOrBefore,
  checkMinYear,
  checkMaxYear,
  evaluateCondition,
  checkContains,
  checkFileTypes,
  checkFileMaxSize,
  checkMaxFiles,
  checkMinFiles,
} from "./validation-methods";
import { ValidationResults } from "@forms/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResults(): ValidationResults {
  return { hasError: false, errors: [] };
}

function makeFile(name: string, sizeBytes: number): File {
  const blob = new Blob(["x".repeat(sizeBytes)], { type: "text/plain" });
  return new File([blob], name, { type: "text/plain" });
}

function makeFileList(...files: File[]): FileList {
  return Object.assign(files, {
    item: (i: number) => files[i] ?? null,
  }) as unknown as FileList;
}

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

  it("returns true for an empty string value (typeof string path)", () => {
    // The falsy guard catches "" before the typeof branch, but a single space is non-empty
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
});

// ---------------------------------------------------------------------------
// checkRequired
// ---------------------------------------------------------------------------

describe("checkRequired", () => {
  const base = { fieldId: "step1_name", fieldName: "Name" };

  it("returns 'requiredAndEmpty' when required and value is empty", () => {
    const results = makeResults();
    const state = checkRequired({
      ...base,
      value: "",
      validations: { required: { value: true, error: "Name is required." } },
      results,
    });
    expect(state).toBe("requiredAndEmpty");
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("Name is required.");
  });

  it("returns 'notRequiredAndEmpty' when not required and value is empty", () => {
    const results = makeResults();
    const state = checkRequired({
      ...base,
      value: "",
      validations: {},
      results,
    });
    expect(state).toBe("notRequiredAndEmpty");
    expect(results.hasError).toBe(false);
  });

  it("returns 'notRequiredAndEmpty' when required.value is false and value is empty", () => {
    const results = makeResults();
    const state = checkRequired({
      ...base,
      value: "",
      validations: { required: { value: false } },
      results,
    });
    expect(state).toBe("notRequiredAndEmpty");
  });

  it("returns 'notEmpty' when required and value is present", () => {
    const results = makeResults();
    const state = checkRequired({
      ...base,
      value: "John",
      validations: { required: { value: true } },
      results,
    });
    expect(state).toBe("notEmpty");
    expect(results.hasError).toBe(false);
  });

  it("returns 'unknownState' when valueIsEmpty cannot determine emptiness", () => {
    const results = makeResults();
    // Pass an object that doesn't match any known FieldValue branch
    const state = checkRequired({
      ...base,
      value: { unknown: true } as never,
      validations: {},
      results,
    });
    expect(state).toBe("unknownState");
  });
});

// ---------------------------------------------------------------------------
// checkLength
// ---------------------------------------------------------------------------

describe("checkLength", () => {
  const base = {
    fieldId: "step1_bio",
    fieldName: "Bio",
    validations: {},
    results: makeResults(),
  };

  it("adds error when value is shorter than minLength", () => {
    const results = makeResults();
    checkLength({
      ...base,
      value: "hi",
      validations: { minLength: { value: 5, error: "Too short." } },
      results,
    });
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("Too short.");
  });

  it("does not error when value meets minLength", () => {
    const results = makeResults();
    checkLength({
      ...base,
      value: "hello",
      validations: { minLength: { value: 5 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when value exceeds maxLength", () => {
    const results = makeResults();
    checkLength({
      ...base,
      value: "hello world",
      validations: { maxLength: { value: 5, error: "Too long." } },
      results,
    });
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("Too long.");
  });

  it("does not error when value meets maxLength exactly", () => {
    const results = makeResults();
    checkLength({
      ...base,
      value: "hello",
      validations: { maxLength: { value: 5 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when no length validations are provided", () => {
    const results = makeResults();
    checkLength({ ...base, value: "hi", validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkSelectionLength
// ---------------------------------------------------------------------------

describe("checkSelectionLength", () => {
  const base = { fieldId: "step1_tags", fieldName: "Tags" };

  it("adds error when fewer selections than minSelection", () => {
    const results = makeResults();
    checkSelectionLength({
      ...base,
      value: ["a"],
      validations: { minSelection: { value: 2, error: "Pick at least 2." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("does not error when selections meet minSelection", () => {
    const results = makeResults();
    checkSelectionLength({
      ...base,
      value: ["a", "b"],
      validations: { minSelection: { value: 2 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when more selections than maxSelection", () => {
    const results = makeResults();
    checkSelectionLength({
      ...base,
      value: ["a", "b", "c"],
      validations: { maxSelection: { value: 2, error: "Pick at most 2." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("does not error when selections meet maxSelection exactly", () => {
    const results = makeResults();
    checkSelectionLength({
      ...base,
      value: ["a", "b"],
      validations: { maxSelection: { value: 2 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when no selection validations are provided", () => {
    const results = makeResults();
    checkSelectionLength({
      ...base,
      value: [],
      validations: {},
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkPattern
// ---------------------------------------------------------------------------

describe("checkPattern", () => {
  const base = { fieldId: "step1_code", fieldName: "Code" };

  it("does not error when value matches the pattern", () => {
    const results = makeResults();
    checkPattern({
      ...base,
      value: "ABC123",
      validations: { pattern: { value: "^[A-Z]{3}\\d{3}$" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when value does not match the pattern", () => {
    const results = makeResults();
    checkPattern({
      ...base,
      value: "abc",
      validations: { pattern: { value: "^[A-Z]+$", error: "Uppercase only." } },
      results,
    });
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("Uppercase only.");
  });

  it("is a no-op when no pattern validation is configured", () => {
    const results = makeResults();
    checkPattern({ ...base, value: "anything", validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkEmail
// ---------------------------------------------------------------------------

describe("checkEmail", () => {
  const base = { fieldId: "step1_email", fieldName: "Email" };

  it("does not error for a valid email", () => {
    const results = makeResults();
    checkEmail({
      ...base,
      value: "test@example.com",
      validations: { email: { value: true } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error for an invalid email", () => {
    const results = makeResults();
    checkEmail({
      ...base,
      value: "not-an-email",
      validations: { email: { value: true, error: "Invalid email." } },
      results,
    });
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("Invalid email.");
  });

  it("is a no-op when no email validation is configured", () => {
    const results = makeResults();
    checkEmail({ ...base, value: "bad@", validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkMinMax
// ---------------------------------------------------------------------------

describe("checkMinMax", () => {
  const base = { fieldId: "step1_age", fieldName: "Age" };

  it("does not error when value is above min", () => {
    const results = makeResults();
    checkMinMax({
      ...base,
      value: "25",
      validations: { min: { value: 18 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when value is below min", () => {
    const results = makeResults();
    checkMinMax({
      ...base,
      value: "10",
      validations: { min: { value: 18, error: "Must be at least 18." } },
      results,
    });
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("Must be at least 18.");
  });

  it("does not error when value equals min", () => {
    const results = makeResults();
    checkMinMax({
      ...base,
      value: "18",
      validations: { min: { value: 18 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when value exceeds max", () => {
    const results = makeResults();
    checkMinMax({
      ...base,
      value: "120",
      validations: { max: { value: 100, error: "Must be at most 100." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("does not error when value equals max", () => {
    const results = makeResults();
    checkMinMax({
      ...base,
      value: "100",
      validations: { max: { value: 100 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when value is a non-numeric string", () => {
    const results = makeResults();
    checkMinMax({
      ...base,
      value: "abc",
      validations: { min: { value: 0 } },
      results,
    });
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("abc is not a valid number");
  });

  it("accepts a numeric number type as value", () => {
    const results = makeResults();
    checkMinMax({
      ...base,
      value: 50,
      validations: { min: { value: 10 }, max: { value: 100 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when no min/max validations are provided", () => {
    const results = makeResults();
    checkMinMax({ ...base, value: "99", validations: {}, results });
    expect(results.hasError).toBe(false);
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
// checkDatePast
// ---------------------------------------------------------------------------

describe("checkDatePast", () => {
  const base = { fieldId: "step1_dob", fieldName: "Date of Birth" };

  it("does not error when date is strictly in the past", () => {
    const results = makeResults();
    const past = new Date("2000-01-01");
    checkDatePast({
      ...base,
      value: past,
      validations: { past: { value: true } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when date is today", () => {
    const results = makeResults();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkDatePast({
      ...base,
      value: today,
      validations: { past: { value: true, error: "Must be in the past." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("adds error when date is in the future", () => {
    const results = makeResults();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    checkDatePast({
      ...base,
      value: future,
      validations: { past: { value: true, error: "Must be in the past." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when past validation is not configured", () => {
    const results = makeResults();
    checkDatePast({ ...base, value: new Date(), validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDatePastOrToday
// ---------------------------------------------------------------------------

describe("checkDatePastOrToday", () => {
  const base = { fieldId: "step1_start", fieldName: "Start Date" };

  it("does not error for a past date", () => {
    const results = makeResults();
    checkDatePastOrToday({
      ...base,
      value: new Date("2000-01-01"),
      validations: { pastOrToday: { value: true } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error for today", () => {
    const results = makeResults();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkDatePastOrToday({
      ...base,
      value: today,
      validations: { pastOrToday: { value: true } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error for a future date", () => {
    const results = makeResults();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    checkDatePastOrToday({
      ...base,
      value: future,
      validations: {
        pastOrToday: { value: true, error: "Must be today or in the past." },
      },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when pastOrToday validation is not configured", () => {
    const results = makeResults();
    checkDatePastOrToday({
      ...base,
      value: new Date(),
      validations: {},
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDateFuture
// ---------------------------------------------------------------------------

describe("checkDateFuture", () => {
  const base = { fieldId: "step1_expiry", fieldName: "Expiry Date" };

  it("does not error when date is strictly in the future", () => {
    const results = makeResults();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    checkDateFuture({
      ...base,
      value: future,
      validations: { future: { value: true } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when date is today", () => {
    const results = makeResults();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkDateFuture({
      ...base,
      value: today,
      validations: { future: { value: true, error: "Must be in the future." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("adds error when date is in the past", () => {
    const results = makeResults();
    checkDateFuture({
      ...base,
      value: new Date("2000-01-01"),
      validations: { future: { value: true, error: "Must be in the future." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when future validation is not configured", () => {
    const results = makeResults();
    checkDateFuture({ ...base, value: new Date(), validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDateFutureOrToday
// ---------------------------------------------------------------------------

describe("checkDateFutureOrToday", () => {
  const base = { fieldId: "step1_appt", fieldName: "Appointment Date" };

  it("does not error for a future date", () => {
    const results = makeResults();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    checkDateFutureOrToday({
      ...base,
      value: future,
      validations: { futureOrToday: { value: true } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error for today", () => {
    const results = makeResults();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkDateFutureOrToday({
      ...base,
      value: today,
      validations: { futureOrToday: { value: true } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error for a past date", () => {
    const results = makeResults();
    checkDateFutureOrToday({
      ...base,
      value: new Date("2000-01-01"),
      validations: {
        futureOrToday: {
          value: true,
          error: "Must be today or in the future.",
        },
      },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when futureOrToday validation is not configured", () => {
    const results = makeResults();
    checkDateFutureOrToday({
      ...base,
      value: new Date(),
      validations: {},
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDateAfter
// ---------------------------------------------------------------------------

describe("checkDateAfter", () => {
  const base = { fieldId: "step1_date", fieldName: "Date" };

  it("does not error when date is strictly after the target", () => {
    const results = makeResults();
    checkDateAfter({
      ...base,
      value: new Date(2025, 0, 2), // Jan 2 2025
      validations: { after: { value: "01/01/2025" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when date equals the target (not strictly after)", () => {
    const results = makeResults();
    checkDateAfter({
      ...base,
      value: new Date(2025, 0, 1),
      validations: { after: { value: "01/01/2025", error: "Must be after." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("adds error when date is before the target", () => {
    const results = makeResults();
    checkDateAfter({
      ...base,
      value: new Date(2024, 11, 31),
      validations: { after: { value: "01/01/2025", error: "Must be after." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when after validation is not configured", () => {
    const results = makeResults();
    checkDateAfter({ ...base, value: new Date(), validations: {}, results });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when after.value is falsy", () => {
    const results = makeResults();
    checkDateAfter({
      ...base,
      value: new Date(),
      validations: { after: { value: "" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when date string cannot be parsed", () => {
    const results = makeResults();
    checkDateAfter({
      ...base,
      value: new Date(),
      validations: { after: { value: "not-a-date" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDateBefore
// ---------------------------------------------------------------------------

describe("checkDateBefore", () => {
  const base = { fieldId: "step1_date", fieldName: "Date" };

  it("does not error when date is strictly before the target", () => {
    const results = makeResults();
    checkDateBefore({
      ...base,
      value: new Date(2024, 11, 31),
      validations: { before: { value: "01/01/2025" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when date equals the target (not strictly before)", () => {
    const results = makeResults();
    checkDateBefore({
      ...base,
      value: new Date(2025, 0, 1),
      validations: {
        before: { value: "01/01/2025", error: "Must be before." },
      },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("adds error when date is after the target", () => {
    const results = makeResults();
    checkDateBefore({
      ...base,
      value: new Date(2025, 0, 2),
      validations: {
        before: { value: "01/01/2025", error: "Must be before." },
      },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when before validation is not configured", () => {
    const results = makeResults();
    checkDateBefore({ ...base, value: new Date(), validations: {}, results });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when the date string cannot be parsed", () => {
    const results = makeResults();
    checkDateBefore({
      ...base,
      value: new Date(),
      validations: { before: { value: "not-a-date" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDateOnOrAfter
// ---------------------------------------------------------------------------

describe("checkDateOnOrAfter", () => {
  const base = { fieldId: "step1_date", fieldName: "Date" };

  it("does not error when date equals the target", () => {
    const results = makeResults();
    checkDateOnOrAfter({
      ...base,
      value: new Date(2025, 0, 1),
      validations: { onOrAfter: { value: "01/01/2025" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when date is after the target", () => {
    const results = makeResults();
    checkDateOnOrAfter({
      ...base,
      value: new Date(2025, 0, 2),
      validations: { onOrAfter: { value: "01/01/2025" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when date is before the target", () => {
    const results = makeResults();
    checkDateOnOrAfter({
      ...base,
      value: new Date(2024, 11, 31),
      validations: {
        onOrAfter: { value: "01/01/2025", error: "Must be on or after." },
      },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when onOrAfter validation is not configured", () => {
    const results = makeResults();
    checkDateOnOrAfter({
      ...base,
      value: new Date(),
      validations: {},
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when the date string cannot be parsed", () => {
    const results = makeResults();
    checkDateOnOrAfter({
      ...base,
      value: new Date(),
      validations: { onOrAfter: { value: "bad" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkDateOnOrBefore
// ---------------------------------------------------------------------------

describe("checkDateOnOrBefore", () => {
  const base = { fieldId: "step1_date", fieldName: "Date" };

  it("does not error when date equals the target", () => {
    const results = makeResults();
    checkDateOnOrBefore({
      ...base,
      value: new Date(2025, 0, 1),
      validations: { onOrBefore: { value: "01/01/2025" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when date is before the target", () => {
    const results = makeResults();
    checkDateOnOrBefore({
      ...base,
      value: new Date(2024, 11, 31),
      validations: { onOrBefore: { value: "01/01/2025" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when date is after the target", () => {
    const results = makeResults();
    checkDateOnOrBefore({
      ...base,
      value: new Date(2025, 0, 2),
      validations: {
        onOrBefore: { value: "01/01/2025", error: "Must be on or before." },
      },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when onOrBefore validation is not configured", () => {
    const results = makeResults();
    checkDateOnOrBefore({
      ...base,
      value: new Date(),
      validations: {},
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when the date string cannot be parsed", () => {
    const results = makeResults();
    checkDateOnOrBefore({
      ...base,
      value: new Date(),
      validations: { onOrBefore: { value: "bad" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkMinYear
// ---------------------------------------------------------------------------

describe("checkMinYear", () => {
  const base = { fieldId: "step1_dob", fieldName: "DOB" };

  it("does not error when year is above minYear", () => {
    const results = makeResults();
    checkMinYear({
      ...base,
      value: { day: 1, month: 1, year: 2000 },
      validations: { minYear: { value: 1900 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when year equals minYear", () => {
    const results = makeResults();
    checkMinYear({
      ...base,
      value: { day: 1, month: 1, year: 1900 },
      validations: { minYear: { value: 1900 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when year is below minYear", () => {
    const results = makeResults();
    checkMinYear({
      ...base,
      value: { day: 1, month: 1, year: 1850 },
      validations: { minYear: { value: 1900, error: "Year too old." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when minYear validation is not configured", () => {
    const results = makeResults();
    checkMinYear({
      ...base,
      value: { day: 1, month: 1, year: 1800 },
      validations: {},
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkMaxYear
// ---------------------------------------------------------------------------

describe("checkMaxYear", () => {
  const base = { fieldId: "step1_dob", fieldName: "DOB" };

  it("does not error when year is below maxYear", () => {
    const results = makeResults();
    checkMaxYear({
      ...base,
      value: { day: 1, month: 1, year: 2020 },
      validations: { maxYear: { value: 2024 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when year equals maxYear", () => {
    const results = makeResults();
    checkMaxYear({
      ...base,
      value: { day: 1, month: 1, year: 2024 },
      validations: { maxYear: { value: 2024 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when year is above maxYear", () => {
    const results = makeResults();
    checkMaxYear({
      ...base,
      value: { day: 1, month: 1, year: 2100 },
      validations: { maxYear: { value: 2024, error: "Year too far." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when maxYear validation is not configured", () => {
    const results = makeResults();
    checkMaxYear({
      ...base,
      value: { day: 1, month: 1, year: 3000 },
      validations: {},
      results,
    });
    expect(results.hasError).toBe(false);
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
    });
  });

  describe("default (unknown operation)", () => {
    it("returns false for an unknown operation", () => {
      expect(evaluateCondition("a", "a", "unknownOp" as never)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// checkContains
// ---------------------------------------------------------------------------

describe("checkContains", () => {
  const base = { fieldId: "step1_notes", fieldName: "Notes" };

  it("does not error when value contains the target substring", () => {
    const results = makeResults();
    checkContains({
      ...base,
      value: "hello world",
      validations: { contains: { value: "world" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when value does not contain the target substring", () => {
    const results = makeResults();
    checkContains({
      ...base,
      value: "hello",
      validations: {
        contains: { value: "world", error: "Must contain world." },
      },
      results,
    });
    expect(results.hasError).toBe(true);
    expect(results.errors).toContain("Must contain world.");
  });

  it("is a no-op when contains validation is not configured", () => {
    const results = makeResults();
    checkContains({ ...base, value: "hello", validations: {}, results });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when contains.value is falsy", () => {
    const results = makeResults();
    checkContains({
      ...base,
      value: "hello",
      validations: { contains: { value: "" } },
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkFileTypes
// ---------------------------------------------------------------------------

describe("checkFileTypes", () => {
  const base = { fieldId: "step1_upload", fieldName: "Upload" };

  it("does not error when all files have allowed extensions", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("doc.pdf", 100));
    checkFileTypes({
      ...base,
      value: files,
      validations: { fileTypes: { value: ["application/pdf"] } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when a file has a disallowed extension", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("doc.exe", 100));
    checkFileTypes({
      ...base,
      value: files,
      validations: {
        fileTypes: { value: ["application/pdf"], error: "Invalid type." },
      },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when fileTypes validation is not configured", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("doc.exe", 100));
    checkFileTypes({ ...base, value: files, validations: {}, results });
    expect(results.hasError).toBe(false);
  });

  it("is a no-op when fileTypes.value is empty", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("doc.exe", 100));
    checkFileTypes({
      ...base,
      value: files,
      validations: { fileTypes: { value: [] } },
      results,
    });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkFileMaxSize
// ---------------------------------------------------------------------------

describe("checkFileMaxSize", () => {
  const base = { fieldId: "step1_upload", fieldName: "Upload" };

  it("does not error when all files are within itemMaxSize", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 500));
    checkFileMaxSize({
      ...base,
      value: files,
      validations: { itemMaxSize: { value: 1000 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when a file exceeds itemMaxSize", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("big.pdf", 2000));
    checkFileMaxSize({
      ...base,
      value: files,
      validations: { itemMaxSize: { value: 1000, error: "File too large." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("does not error when total size is within maxSize", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 300), makeFile("b.pdf", 300));
    checkFileMaxSize({
      ...base,
      value: files,
      validations: { maxSize: { value: 1000 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when total size exceeds maxSize", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 600), makeFile("b.pdf", 600));
    checkFileMaxSize({
      ...base,
      value: files,
      validations: { maxSize: { value: 1000, error: "Total size exceeded." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when no size validations are configured", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 999999));
    checkFileMaxSize({ ...base, value: files, validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkMaxFiles
// ---------------------------------------------------------------------------

describe("checkMaxFiles", () => {
  const base = { fieldId: "step1_upload", fieldName: "Upload" };

  it("does not error when file count is within maxItems", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 100), makeFile("b.pdf", 100));
    checkMaxFiles({
      ...base,
      value: files,
      validations: { maxItems: { value: 3 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when file count equals maxItems", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 100), makeFile("b.pdf", 100));
    checkMaxFiles({
      ...base,
      value: files,
      validations: { maxItems: { value: 2 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when file count exceeds maxItems", () => {
    const results = makeResults();
    const files = makeFileList(
      makeFile("a.pdf", 100),
      makeFile("b.pdf", 100),
      makeFile("c.pdf", 100),
    );
    checkMaxFiles({
      ...base,
      value: files,
      validations: { maxItems: { value: 2, error: "Too many files." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when maxItems validation is not configured", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 100));
    checkMaxFiles({ ...base, value: files, validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkMinFiles
// ---------------------------------------------------------------------------

describe("checkMinFiles", () => {
  const base = { fieldId: "step1_upload", fieldName: "Upload" };

  it("does not error when file count meets minItems", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 100), makeFile("b.pdf", 100));
    checkMinFiles({
      ...base,
      value: files,
      validations: { minItems: { value: 2 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("does not error when file count exceeds minItems", () => {
    const results = makeResults();
    const files = makeFileList(
      makeFile("a.pdf", 100),
      makeFile("b.pdf", 100),
      makeFile("c.pdf", 100),
    );
    checkMinFiles({
      ...base,
      value: files,
      validations: { minItems: { value: 2 } },
      results,
    });
    expect(results.hasError).toBe(false);
  });

  it("adds error when file count is below minItems", () => {
    const results = makeResults();
    const files = makeFileList(makeFile("a.pdf", 100));
    checkMinFiles({
      ...base,
      value: files,
      validations: { minItems: { value: 2, error: "Too few files." } },
      results,
    });
    expect(results.hasError).toBe(true);
  });

  it("is a no-op when minItems validation is not configured", () => {
    const results = makeResults();
    const files = makeFileList();
    checkMinFiles({ ...base, value: files, validations: {}, results });
    expect(results.hasError).toBe(false);
  });
});
