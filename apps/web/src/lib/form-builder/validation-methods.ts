import { ValidationConfig, EqualityOperations } from "@govtech-bb/form-types";
import { AnyFieldApi } from "@tanstack/react-form";
import {
  ValidationArgs,
  DateValue,
  DateValueInput,
  ValidationResults,
  FieldValue,
} from "@web/types";
import z from "zod";

// Modular Methods

export type RequiredState =
  | "requiredAndEmpty"
  | "notRequiredAndEmpty"
  | "notRequired"
  | "notEmpty"
  | "unknownState";

export const valueIsEmpty = (value: FieldValue): boolean | undefined => {
  if (!value) return true;
  if (typeof value === "string")
    return value.length === 0; // If required and no content, flag it.
  else if (Array.isArray(value)) {
    return value.length === 0; // I want this to check each element for truthiness
  } else if (typeof value === "boolean")
    return !value; // It's a boolean. If it's required then it must be true
  else if (typeof value === "number") return value.toString().length === 0;
  else if ("day" in value || "month" in value || "year" in value) {
    // Checking for DateValueInput
    return !isDateComplete(value); // need to negate
  } else {
    return undefined;
  }
};

const setValidationError = (
  fieldLabel: string,
  validation: ValidationConfig,
  results: ValidationResults,
  customError?: string,
) => {
  const errorMessage =
    (validation.error || customError) ??
    `Unknown error has occurred for ${fieldLabel}`;
  if (results.hasError === true) {
    results.errors.push(errorMessage.replace(`${fieldLabel}`, ""));
  } else {
    results.hasError = true;
    results.errors.push(errorMessage);
  }
};

export const checkRequired = ({
  fieldId,
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<FieldValue>): RequiredState => {
  const required = validations.required;

  const isEmpty = valueIsEmpty(value);
  if (isEmpty === undefined) {
    console.error(`Value ${value} for field ${fieldId} is unknown.`);
    return "unknownState";
  }

  if (required && required.value && isEmpty) {
    setValidationError(fieldLabel, required, results);
    return "requiredAndEmpty";
  }
  if ((!required || (required && !required.value)) && isEmpty)
    return "notRequiredAndEmpty";

  return "notEmpty";
};

export const checkLength = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const minLength = validations.minLength;
  const maxLength = validations.maxLength;

  if (minLength && minLength.value && value.length < minLength.value) {
    setValidationError(fieldLabel, minLength, results);
  }

  if (maxLength && maxLength.value && value.length > maxLength.value) {
    setValidationError(fieldLabel, maxLength, results);
  }
};

export const checkSelectionLength = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<string[]>) => {
  const minSelection = validations.minSelection;
  const maxSelection = validations.maxSelection;

  if (minSelection && minSelection.value && value.length < minSelection.value) {
    setValidationError(fieldLabel, minSelection, results);
  }

  if (maxSelection && maxSelection.value && value.length > maxSelection.value) {
    setValidationError(fieldLabel, maxSelection, results);
  }
};

export const checkPattern = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const pattern = validations.pattern;
  if (!pattern) return;

  const re = new RegExp(pattern.value);

  const match = re.test(value);
  if (!match) {
    setValidationError(fieldLabel, pattern, results);
  }
};

export const checkEmail = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const email = validations.email;
  if (!email) return;

  try {
    z.email().parse(value);
  } catch {
    setValidationError(fieldLabel, email, results);
  }
};

export const checkMinMax = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<string | number>) => {
  const min = validations.min;
  const max = validations.max;

  const stringToNumCheck = (value: string | number): number | null => {
    if (typeof value === "number") return value;
    const num = parseFloat(value);
    if (isNaN(num)) {
      results.hasError = true;
      results.errors.push(`${value} is not a valid number`);
      return null;
    }
    return num;
  };

  // Need to handle if min.value or max.value is 0, which is falsy.
  if (min && min.value?.toString().length >= 1) {
    const num = stringToNumCheck(value);
    if (num && num < min.value) {
      setValidationError(fieldLabel, min, results);
    }
  }

  if (max && max.value?.toString().length >= 1) {
    const num = stringToNumCheck(value);
    if (num && num > max.value) {
      setValidationError(fieldLabel, max, results);
    }
  }
};

export const dateValueToDate = (value: DateValue): Date | null => {
  if (
    value.day === undefined ||
    value.month === undefined ||
    value.year === undefined
  ) {
    return null;
  }
  return new Date(value.year, value.month - 1, value.day);
};

const parseDateString = (dateStr: string): Date | null => {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
};

export const isDateComplete = (value: DateValueInput): boolean => {
  return (
    value.day !== undefined &&
    value.month !== undefined &&
    value.year !== undefined
  );
};

export const checkDatePast = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const past = validations.past;
  if (!past) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value >= today) {
    setValidationError(fieldLabel, past, results);
  }
};

export const checkDatePastOrToday = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const pastOrToday = validations.pastOrToday;
  if (!pastOrToday) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value > today) {
    setValidationError(fieldLabel, pastOrToday, results);
  }
};

export const checkDateFuture = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const future = validations.future;
  if (!future) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value <= today) {
    setValidationError(fieldLabel, future, results);
  }
};

export const checkDateFutureOrToday = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const futureOrToday = validations.futureOrToday;
  if (!futureOrToday) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value < today) {
    setValidationError(fieldLabel, futureOrToday, results);
  }
};

export const checkDateAfter = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const after = validations.after;
  if (!after || !after.value) return;

  const targetDate = parseDateString(after.value);
  if (!targetDate) return;

  if (value <= targetDate) {
    setValidationError(fieldLabel, after, results);
  }
};
export const checkDateBefore = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const before = validations.before;
  if (!before || !before.value) return;

  const targetDate = parseDateString(before.value);
  if (!targetDate) return;

  if (value >= targetDate) {
    setValidationError(fieldLabel, before, results);
  }
};
export const checkDateOnOrAfter = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const onOrAfter = validations.onOrAfter;
  if (!onOrAfter || !onOrAfter.value) return;

  const targetDate = parseDateString(onOrAfter.value);
  if (!targetDate) return;

  if (value < targetDate) {
    setValidationError(fieldLabel, onOrAfter, results);
  }
};
export const checkDateOnOrBefore = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const onOrBefore = validations.onOrBefore;
  if (!onOrBefore || !onOrBefore.value) return;

  const targetDate = parseDateString(onOrBefore.value);
  if (!targetDate) return;

  if (value > targetDate) {
    setValidationError(fieldLabel, onOrBefore, results);
  }
};
export const checkMinYear = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<DateValue>) => {
  const minYear = validations.minYear;
  if (!minYear || minYear.value === undefined) return;

  if (value.year < minYear.value) {
    setValidationError(fieldLabel, minYear, results);
  }
};
export const checkMaxYear = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<DateValue>) => {
  const maxYear = validations.maxYear;
  if (!maxYear || maxYear.value === undefined) return;

  if (value.year > maxYear.value) {
    setValidationError(fieldLabel, maxYear, results);
  }
};
/*
 * Checks for equality, inequality, greater than and lesser than
 */
export const checkComparisons = (
  { fieldLabel, value, results, validations }: ValidationArgs<string | number>,
  fieldApi: AnyFieldApi,
) => {
  const equal = validations.equal;
  const notEqual = validations.notEqual;

  const gt = validations.gt;
  const lt = validations.lt;

  if (!equal && !notEqual && !gt && !lt) return; // No validations provided

  const compare = (
    comp: "equal" | "notEqual" | "gt" | "lt",
    validation?: ValidationConfig,
  ) => {
    if (validation && validation.reference) {
      const targetFieldValue = fieldApi.form.getFieldValue(
        validation.reference,
      );
      const passesCondition = evaluateCondition(value, targetFieldValue, comp);
      if (!passesCondition) {
        setValidationError(fieldLabel, validation, results);
      }
    }
  };

  compare("equal", equal);
  compare("notEqual", notEqual);
  compare("gt", gt);
  compare("lt", lt);
};
export const checkContains = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const contains = validations.contains;
  if (!contains || !contains.value) return;

  const passesCondition = evaluateCondition(value, contains.value, "contains");

  if (!passesCondition) {
    setValidationError(fieldLabel, contains, results);
  }
};

export const evaluateCondition = (
  conditionValue: FieldValue,
  targetFieldValue: FieldValue | undefined,
  operation: EqualityOperations | "gt" | "lt" | "contains" | "strictEquality",
): boolean => {
  switch (operation) {
    case "in":
    case "contains":
      if (
        targetFieldValue &&
        conditionValue &&
        (Array.isArray(conditionValue) || typeof conditionValue === "string") &&
        (typeof targetFieldValue === "string" ||
          typeof targetFieldValue === "boolean" ||
          typeof targetFieldValue === "number") &&
        conditionValue.includes(targetFieldValue.toString())
      )
        return true;
      else return false;
    case "equal": // Can be case insensitive
      if (conditionValue && targetFieldValue) {
        return (
          conditionValue == targetFieldValue ||
          (typeof conditionValue === "string" &&
            typeof targetFieldValue === "string" &&
            conditionValue.toLowerCase() === targetFieldValue.toLowerCase())
        );
      } else return false;
    case "strictEquality":
      if (
        conditionValue &&
        targetFieldValue &&
        conditionValue === targetFieldValue
      )
        return true;
      return false;
    case "notEqual":
      if (
        conditionValue &&
        targetFieldValue &&
        conditionValue != targetFieldValue
      )
        return true;
      else return false;
    case "exists":
      if (targetFieldValue && !valueIsEmpty(targetFieldValue)) return true;
      return false;
    case "gt":
      if (conditionValue && targetFieldValue) {
        const cv = Number(conditionValue);
        const tfv = Number(targetFieldValue);

        if (!isNaN(cv) && !isNaN(tfv)) return cv > tfv;
      }
      return false;
    case "lt":
      if (conditionValue && targetFieldValue) {
        const cv = Number(conditionValue);
        const tfv = Number(targetFieldValue);

        if (!isNaN(cv) && !isNaN(tfv)) return cv < tfv;
      }
      return false;

    default:
      return false;
  }
};

export const checkFileTypes = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  const fileTypes = validations.fileTypes;
  if (!fileTypes || fileTypes.value.length === 0) return;

  // Remove prefix from file types if present (e.g. "image/png" → "png")
  const allowedExtensions = fileTypes.value.map((type: string) => {
    const parts = type.split("/");
    return parts.length > 1 ? parts[1].toLowerCase() : type.toLowerCase();
  });

  for (const file of value) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension && !allowedExtensions.includes(extension)) {
      setValidationError(
        fieldLabel,
        fileTypes,
        results,
        `File ${file.name} has an invalid type. Allowed types: ${fileTypes.value.join(", ")}.`,
      );
    }
  }
};

export const checkFileMaxSize = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  const fileMaxSize = validations.maxSize?.value;
  if (!fileMaxSize || fileMaxSize === undefined) return;

  for (const file of value) {
    if (file.size > fileMaxSize) {
      setValidationError(
        fieldLabel,
        fileMaxSize,
        results,
        `File ${file.name} exceeds the maximum size of ${(fileMaxSize / (1024 * 1024)).toPrecision(2)} MB.`,
      );
    }
  }
};

export const checkMaxFiles = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  const maxItems = validations.maxItems;
  if (!maxItems || maxItems.value === undefined) return;

  if (value.length > maxItems.value) {
    setValidationError(
      fieldLabel,
      maxItems,
      results,
      `Number of files exceeds the maximum allowed (${maxItems.value}).`,
    );
  }
};

export const checkMinFiles = ({
  fieldLabel,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  const minItems = validations.minItems;
  if (!minItems || minItems.value === undefined) return;

  if (value.length < minItems.value) {
    setValidationError(
      fieldLabel,
      minItems,
      results,
      `Number of files is less than the minimum required (${minItems.value}).`,
    );
  }
};
