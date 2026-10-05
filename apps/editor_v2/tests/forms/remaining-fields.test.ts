import { legacyFieldAdapter } from "../../src/forms/legacy";
import { expect, test } from "vitest";
import { longAnswerField } from "../../src/forms/features/long-answer/definition";
import { emailField } from "../../src/forms/features/email/definition";
import { phoneField } from "../../src/forms/features/phone/definition";
import { numberField } from "../../src/forms/features/number/definition";
import { dateField } from "../../src/forms/features/date/definition";
import { timeField } from "../../src/forms/features/time/definition";
import { multipleChoiceField } from "../../src/forms/features/multiple-choice/definition";
import { checkboxesField } from "../../src/forms/features/checkboxes/definition";
import { dropdownField } from "../../src/forms/features/dropdown/definition";
import { addressLookupField } from "../../src/forms/features/address-lookup/definition";
import type { Settings } from "../../src/forms/core/settings";

test("written fields retain raw unfinished limits and project only their existing SSB rules", () => {
  const raw: Settings = {
    required: true,
    hasMinCharacters: true,
    minCharacters: 0,
    hasMaxCharacters: true,
    maxCharacters: "unfinished",
    future: { enabled: false },
    step: 17,
    pattern: "[",
    mask: "999",
    ref: "components/old",
    width: "medium",
    relativeDate: "unrecognised",
    isDisabled: false,
  };

  const before = JSON.stringify(raw);
  expect(legacyFieldAdapter(longAnswerField)!.rules(raw)).toEqual([
    { rule: "required", label: "When it's empty" },
    { rule: "minLength", label: "Too few characters", value: 0 },
    { rule: "maxLength", label: "Too many characters", value: "unfinished" },
  ]);
  expect(legacyFieldAdapter(emailField)!.rules(raw)).toEqual([
    { rule: "required", label: "When it's empty" },
    { rule: "email", label: "Invalid email address" },
  ]);
  expect(legacyFieldAdapter(phoneField)!.rules(raw)).toEqual([
    { rule: "required", label: "When it's empty" },
    { rule: "phone", label: "Invalid telephone number" },
  ]);

  for (const field of [longAnswerField, emailField, phoneField]) {
    const projected = legacyFieldAdapter(field)!.settings(raw);

    for (const key of ["step", "pattern", "mask", "ref", "relativeDate", "isDisabled"])
      expect(projected[key]).toBeUndefined();
    expect(projected).toMatchObject({
      minCharacters: 0,
      maxCharacters: "unfinished",
      width: "medium",
      future: { enabled: false },
    });
    expect(field.validate({ width: ["short"] }, "draft")).toEqual([
      { code: "field-width", message: "Field width must be short, medium or long", where: "draft" },
    ]);
    expect(field.validate({ width: "medium" }, "draft")).toEqual([]);
  }

  expect(JSON.stringify(raw)).toBe(before);
  expect(
    legacyFieldAdapter(longAnswerField)!.rules({
      hasMinCharacters: false,
      minCharacters: 3,
      hasMaxCharacters: true,
      maxCharacters: "",
    }),
  ).toEqual([]);
});

test("email and phone retain their native format rules when optional and their existing messages", () => {
  expect(legacyFieldAdapter(emailField)!.rules({ required: false })).toEqual([
    { rule: "email", label: "Invalid email address" },
  ]);
  expect(legacyFieldAdapter(phoneField)!.rules({ required: false })).toEqual([
    { rule: "phone", label: "Invalid telephone number" },
  ]);
  expect(
    legacyFieldAdapter(emailField)!.message!("email", { label: "Work email", optionCount: 0 }),
  ).toBe("Enter an email address in the correct format, like name@example.com");
  expect(
    legacyFieldAdapter(phoneField)!.message!("phone", { label: "Telephone", optionCount: 0 }),
  ).toBe("Enter a telephone number, like 246 123 4567");
});

test("number and time preserve absent increments, malformed drafts and their distinct native validation", () => {
  for (const field of [numberField, timeField]) {
    expect(field.defaults).toEqual({ required: true });
    expect(legacyFieldAdapter(field)!.settings({}).step).toBeUndefined();
    expect(legacyFieldAdapter(field)!.settings({ step: 0, future: false })).toEqual({
      step: 0,
      future: false,
    });
    expect(field.validate({ step: 0 }, "field")).toEqual([
      { code: "field-step", message: "Enter a number greater than 0", where: "field" },
    ]);
    expect(field.validate({ step: "unfinished" }, "field")).toEqual([
      { code: "field-step", message: "Enter a number greater than 0", where: "field" },
    ]);
  }

  expect(numberField.validate({ step: 0.25 }, "field")).toEqual([]);
  expect(timeField.validate({ step: 0.25 }, "field")).toEqual([
    { code: "field-step", message: "Enter a whole number of seconds", where: "field" },
  ]);
  expect(timeField.validate({ step: 1800 }, "field")).toEqual([]);
  expect(
    legacyFieldAdapter(numberField)!.rules({
      hasMinNumber: true,
      minNumber: 0,
      hasMaxNumber: true,
      maxNumber: "unfinished",
    }),
  ).toEqual([
    { rule: "min", label: "Below the minimum", value: 0 },
    { rule: "max", label: "Above the maximum", value: "unfinished" },
  ]);
});

test("date field retains simultaneous imported date constraints and age limits without enabling repetition", () => {
  const raw: Settings = {
    required: true,
    relativeDate: "pastOrToday",
    beforeDate: "2040-01-01",
    afterDate: "1900-01-01",
    dateRange: { from: "2000-01-01", to: "2030-01-01" },
    hasMinAge: true,
    minAge: 0,
    hasMaxAge: true,
    maxAge: "unfinished",
    step: 60,
    width: "short",
    pattern: "[",
    mask: "99",
  };

  const before = JSON.stringify(raw);
  expect(legacyFieldAdapter(dateField)!.rules(raw)).toEqual([
    { rule: "required", label: "When it's empty" },
    { rule: "pastOrToday", label: "After today" },
    { rule: "before", label: "After the allowed date", value: "2040-01-01" },
    { rule: "after", label: "Before the allowed date", value: "1900-01-01" },
    { rule: "onOrAfter", label: "Outside the date range", value: "2000-01-01" },
    { rule: "onOrBefore", label: "Outside the date range", value: "2030-01-01" },
    { rule: "min", label: "Younger than the minimum age", value: 0 },
    { rule: "max", label: "Older than the maximum age", value: "unfinished" },
  ]);
  const projected = legacyFieldAdapter(dateField)!.settings(raw);

  for (const key of ["step", "width", "pattern", "mask"]) expect(projected[key]).toBeUndefined();
  expect(projected.relativeDate).toBe("pastOrToday");
  expect(dateField.capabilities.repeat).toBe(false);
  expect(JSON.stringify(raw)).toBe(before);
});

test("choice modules retain declaration and question-shaped required wording plus incomplete choice limits", () => {
  expect(
    legacyFieldAdapter(checkboxesField)!.message!("required", { label: "Agree?", optionCount: 1 }),
  ).toBe("You must confirm the declaration to continue");

  for (const field of [multipleChoiceField, checkboxesField, dropdownField]) {
    expect(
      legacyFieldAdapter(field)!.message!("required", {
        label: "Where do you live?",
        optionCount: 2,
      }),
    ).toBe("Answer “Where do you live?”");
    expect(
      legacyFieldAdapter(field)!.message!("required", { label: "An option", optionCount: 2 }),
    ).toBe("Answer “An option”");
    expect(
      legacyFieldAdapter(field)!.message!("required", { label: "Services", optionCount: 2 }),
    ).toBe("Select services");
    expect(field.defaults).toEqual({ required: true });
    expect(field.capabilities.repeat).toBe(false);
  }

  expect(
    legacyFieldAdapter(checkboxesField)!.rules({
      hasMinChoices: true,
      minChoices: 0,
      hasMaxChoices: true,
      maxChoices: "unfinished",
    }),
  ).toEqual([
    { rule: "minSelection", label: "Too few choices", value: 0 },
    { rule: "maxSelection", label: "Too many choices", value: "unfinished" },
  ]);

  const raw = {
    optionValue: "Keep My Value",
    sourceOptionValue: "Old Value",
    hasOtherOption: false,
    width: "medium",
  };

  expect(legacyFieldAdapter(dropdownField)!.settings(raw)).toEqual(raw);
  expect(legacyFieldAdapter(multipleChoiceField)!.settings(raw)).toEqual({
    optionValue: "Keep My Value",
    sourceOptionValue: "Old Value",
    hasOtherOption: false,
  });

  const staleSettings = {
    hasDefaultAnswer: true,
    defaultAnswer: "unused",
    hasMinChoices: true,
    minChoices: 2,
    hasMaxChoices: true,
    maxChoices: 3,
  };

  expect(legacyFieldAdapter(multipleChoiceField)!.settings(staleSettings)).toEqual({});
  expect(legacyFieldAdapter(dropdownField)!.settings(staleSettings)).toEqual({});
  expect(legacyFieldAdapter(checkboxesField)!.settings(staleSettings)).toEqual({
    hasMinChoices: true,
    minChoices: 2,
    hasMaxChoices: true,
    maxChoices: 3,
  });
  expect(legacyFieldAdapter(dropdownField)!.placeholder!({ placeholder: "Choose a parish" })).toBe(
    "Choose a parish",
  );
  expect(legacyFieldAdapter(dropdownField)!.placeholder!({})).toBe("");
  expect(multipleChoiceField.choice!.multiple).toBe(false);
  expect(checkboxesField.choice!.multiple).toBe(true);
  expect(dropdownField.choice!.multiple).toBe(false);
});

test("address lookup retains its registry provenance, pinned messages and native draft limits", () => {
  const defaults = addressLookupField.defaults;
  expect(defaults).toEqual({
    width: "long",
    hasMinCharacters: true,
    minCharacters: 5,
    ref: "components/address-lookup",
    sourceFieldId: "address-lookup",
    sourceLabel: "Address",
    errors: { required: "Address is required", minLength: "Address must be at least 5 characters" },
    required: true,
  });
  expect(addressLookupField.capabilities.repeat).toBe(false);
  expect(legacyFieldAdapter(addressLookupField)!.rules(defaults)).toEqual([
    { rule: "required", label: "When it's empty" },
    { rule: "minLength", label: "Too few characters", value: 5 },
  ]);

  const draft: Settings = {
    ...structuredClone(defaults),
    minCharacters: "unfinished",
    step: 3,
    mask: "999",
    pattern: "[",
    hasDefaultAnswer: true,
    defaultAnswer: "Bridgetown",
    future: { enabled: false },
  };

  const before = JSON.stringify(draft);
  const projected = legacyFieldAdapter(addressLookupField)!.settings(draft);
  expect(projected).toMatchObject({
    sourceFieldId: "address-lookup",
    sourceLabel: "Address",
    errors: defaults.errors,
    minCharacters: "unfinished",
    width: "long",
    hasDefaultAnswer: true,
    defaultAnswer: "Bridgetown",
    future: { enabled: false },
  });

  for (const key of ["ref", "step", "pattern", "mask"]) expect(projected[key]).toBeUndefined();
  expect(legacyFieldAdapter(addressLookupField)!.rules(draft)[1]!.value).toBe("unfinished");
  expect(addressLookupField.validate({ width: ["short"] }, "address")).toEqual([
    { code: "field-width", message: "Field width must be short, medium or long", where: "address" },
  ]);
  expect(JSON.stringify(draft)).toBe(before);
});
