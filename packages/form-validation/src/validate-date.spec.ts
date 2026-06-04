import {
  validateDateField,
  isDateValidationError,
  isCompleteDateValue,
  formatDateValue,
} from "./validate-date";
import type { Primitive, ValidationRule } from "@govtech-bb/form-types";

const makeField = (validations: ValidationRule = {}): Primitive =>
  ({
    fieldId: "dob",
    label: "Date of birth",
    htmlType: "date",
    validations: { required: { value: true }, ...validations },
  }) as Primitive;

describe("validateDateField", () => {
  describe("priority 1 — missing or incomplete", () => {
    it("returns 'Enter [label]' when nothing is entered and the field is required", () => {
      const err = validateDateField(makeField(), undefined, {});
      expect(err).toEqual({
        message: "Enter date of birth",
        parts: ["day", "month", "year"],
      });
    });

    it("treats an all-empty parts object as nothing entered", () => {
      const err = validateDateField(makeField(), {}, {});
      expect(err?.message).toBe("Enter date of birth");
    });

    it("keeps an acronym label's casing in the 'Enter' message", () => {
      const field = {
        ...makeField(),
        label: "NIS registration date",
      } as Primitive;
      const err = validateDateField(field, undefined, {});
      expect(err?.message).toBe("Enter NIS registration date");
    });

    it("honours a configured required error override", () => {
      const field = makeField();
      field.validations!.required = { value: true, error: "Custom required" };
      const err = validateDateField(field, undefined, {});
      expect(err?.message).toBe("Custom required");
    });

    it("returns null when empty and not required", () => {
      const field = {
        ...makeField(),
        validations: { past: {} },
      } as Primitive;
      expect(validateDateField(field, undefined, {})).toBeNull();
      expect(validateDateField(field, {}, {})).toBeNull();
    });

    it("names the single missing part and highlights it", () => {
      const err = validateDateField(makeField(), { day: 5, year: 1990 }, {});
      expect(err).toEqual({
        message: "Date of birth must include a month",
        parts: ["month"],
      });
    });

    it("names two missing parts and highlights both", () => {
      const err = validateDateField(makeField(), { year: 1990 }, {});
      expect(err).toEqual({
        message: "Date of birth must include a day and month",
        parts: ["day", "month"],
      });
    });

    it("flags incomplete dates even when the field is not required", () => {
      const field = { ...makeField(), validations: { past: {} } } as Primitive;
      const err = validateDateField(field, { day: 5 }, {});
      expect(err?.message).toBe("Date of birth must include a month and year");
    });

    it("requires 4 numbers in the year", () => {
      const err = validateDateField(
        makeField(),
        { day: 5, month: 6, year: 90 },
        {},
      );
      expect(err).toEqual({
        message: "Year must include 4 numbers",
        parts: ["year"],
      });
    });
  });

  describe("priority 2 — information that cannot be correct", () => {
    it("rejects an impossible month and highlights the month field", () => {
      const err = validateDateField(
        makeField(),
        { day: 5, month: 13, year: 1990 },
        {},
      );
      expect(err).toEqual({
        message: "Date of birth must be a real date",
        parts: ["month"],
      });
    });

    it("rejects an impossible day for the month and highlights the day field", () => {
      const err = validateDateField(
        makeField(),
        { day: 31, month: 2, year: 1990 },
        {},
      );
      expect(err).toEqual({
        message: "Date of birth must be a real date",
        parts: ["day"],
      });
    });

    it("accepts 29 February in a leap year", () => {
      const err = validateDateField(
        makeField(),
        { day: 29, month: 2, year: 2024 },
        {},
      );
      expect(err).toBeNull();
    });

    it("rejects 29 February in a non-leap year", () => {
      const err = validateDateField(
        makeField(),
        { day: 29, month: 2, year: 2023 },
        {},
      );
      expect(err?.message).toBe("Date of birth must be a real date");
    });

    it("highlights the whole input when more than one part is impossible", () => {
      const err = validateDateField(
        makeField(),
        { day: 32, month: 13, year: 1990 },
        {},
      );
      expect(err).toEqual({
        message: "Date of birth must be a real date",
        parts: ["day", "month", "year"],
      });
    });

    it("takes priority over configured rules", () => {
      const field = makeField({ past: {} });
      const err = validateDateField(
        field,
        { day: 31, month: 2, year: 1990 },
        {},
      );
      expect(err?.message).toBe("Date of birth must be a real date");
    });
  });

  describe("priority 3 — configured rules", () => {
    it("uses '[label] must be in the past' for the past rule", () => {
      const field = makeField({ past: {} });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 9000 },
        {},
      );
      expect(err).toEqual({
        message: "Date of birth must be in the past",
        parts: ["day", "month", "year"],
      });
    });

    it("uses '[label] must be today or in the past' for pastOrToday", () => {
      const field = makeField({ pastOrToday: {} });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 9000 },
        {},
      );
      expect(err?.message).toBe("Date of birth must be today or in the past");
    });

    it("uses '[label] must be in the future' for the future rule", () => {
      const field = makeField({ future: {} });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 2000 },
        {},
      );
      expect(err?.message).toBe("Date of birth must be in the future");
    });

    it("uses '[label] must be today or in the future' for futureOrToday", () => {
      const field = makeField({ futureOrToday: {} });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 2000 },
        {},
      );
      expect(err?.message).toBe("Date of birth must be today or in the future");
    });

    it("formats a literal threshold date in comparison messages", () => {
      const field = makeField({ after: { value: "01/09/2017" } });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 2017 },
        {},
      );
      expect(err?.message).toBe("Date of birth must be after 1 September 2017");
    });

    it("uses 'the same as or after' wording for onOrAfter", () => {
      const field = makeField({ onOrAfter: { value: "01/09/2017" } });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 2017 },
        {},
      );
      expect(err?.message).toBe(
        "Date of birth must be the same as or after 1 September 2017",
      );
    });

    it("uses 'before' wording with a formatted referenced date", () => {
      const field = makeField({
        before: { referenceFieldId: "courseStart" },
      });
      const allValues = {
        course: { courseStart: { day: 1, month: 9, year: 2017 } },
      };
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 2020 },
        allValues,
        { courseStart: { day: 1, month: 9, year: 2017 } },
      );
      expect(err?.message).toBe(
        "Date of birth must be before 1 September 2017",
      );
    });

    it("uses 'the same as or before' wording for onOrBefore", () => {
      const field = makeField({ onOrBefore: { value: "31/08/2017" } });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 2020 },
        {},
      );
      expect(err?.message).toBe(
        "Date of birth must be the same as or before 31 August 2017",
      );
    });

    it("prefers a configured error string over the default wording", () => {
      const field = makeField({ past: { error: "Custom past message" } });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 9000 },
        {},
      );
      expect(err?.message).toBe("Custom past message");
    });

    it("skips comparison rules whose reference is missing", () => {
      const field = makeField({ after: { referenceFieldId: "otherDate" } });
      const err = validateDateField(
        field,
        { day: 1, month: 1, year: 2020 },
        {},
      );
      expect(err).toBeNull();
    });

    it("returns null for a valid date", () => {
      const field = makeField({ past: {} });
      const err = validateDateField(
        field,
        { day: 5, month: 6, year: 1990 },
        {},
      );
      expect(err).toBeNull();
    });
  });

  describe("legacy string values", () => {
    it("validates ISO string dates against configured rules", () => {
      const field = makeField({ past: {} });
      expect(validateDateField(field, "1990-06-05", {})).toBeNull();
      expect(validateDateField(field, "9000-01-01", {})?.message).toBe(
        "Date of birth must be in the past",
      );
    });

    it("rejects an unparseable string as not a real date", () => {
      const err = validateDateField(makeField(), "not-a-date", {});
      expect(err).toEqual({
        message: "Date of birth must be a real date",
        parts: ["day", "month", "year"],
      });
    });
  });

  describe("helpers", () => {
    it("isDateValidationError narrows structured errors and rejects strings", () => {
      expect(isDateValidationError({ message: "x", parts: ["day"] })).toBe(
        true,
      );
      expect(isDateValidationError("plain error")).toBe(false);
      expect(isDateValidationError(null)).toBe(false);
      expect(isDateValidationError({ message: "x" })).toBe(false);
    });

    it("isCompleteDateValue accepts only fully numeric { day, month, year }", () => {
      expect(isCompleteDateValue({ day: 5, month: 6, year: 1990 })).toBe(true);
      expect(isCompleteDateValue({ day: 5, month: 6 })).toBe(false);
      expect(isCompleteDateValue({ day: "5", month: 6, year: 1990 })).toBe(
        false,
      );
      expect(isCompleteDateValue("1990-06-05")).toBe(false);
      expect(isCompleteDateValue(null)).toBe(false);
    });

    it("formatDateValue renders the GOV.UK long format", () => {
      expect(formatDateValue({ day: 1, month: 9, year: 2017 })).toBe(
        "1 September 2017",
      );
    });
  });
});
