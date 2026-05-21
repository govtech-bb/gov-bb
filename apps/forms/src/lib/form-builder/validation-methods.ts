import {
  ValidationConfig,
  EqualityOperations,
  DateValue,
  DateValueInput,
  FieldValue,
} from "@govtech-bb/form-types";
import { AnyFieldApi } from "@tanstack/react-form";
import { ValidationArgs, ValidationResults } from "@forms/types";
import z from "zod";
import { getFullFieldId, stepFieldIdConcactenator } from "./field-mapper";

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
  fieldName: string,
  validation: ValidationConfig,
  results: ValidationResults,
  customError?: string,
) => {
  const errorMessage =
    (validation.error || customError) ??
    `Unknown error has occurred for ${fieldName}`;
  if (results.hasError === true) {
    const formattedError = errorMessage.replace(`${fieldName}`, "");
    if (!results.errors.includes(formattedError))
      results.errors.push(formattedError);
  } else {
    results.hasError = true;
    if (!results.errors.includes(errorMessage))
      results.errors.push(errorMessage);
  }
};

export const checkRequired = ({
  fieldId,
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<FieldValue>): RequiredState => {
  const required = validations.required;

  const isEmpty = valueIsEmpty(value);
  if (isEmpty === undefined) {
    console.error(`Value for field ${fieldId} is unknown.`);
    return "unknownState";
  }

  if (required && required.value && isEmpty) {
    setValidationError(fieldName, required, results);
    return "requiredAndEmpty";
  }
  if ((!required || (required && !required.value)) && isEmpty)
    return "notRequiredAndEmpty";

  return "notEmpty";
};

export const checkLength = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const minLength = validations.minLength;
  const maxLength = validations.maxLength;

  if (minLength && minLength.value && value.length < minLength.value) {
    setValidationError(fieldName, minLength, results);
  }

  if (maxLength && maxLength.value && value.length > maxLength.value) {
    setValidationError(fieldName, maxLength, results);
  }
};

export const checkSelectionLength = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<string[]>) => {
  const minSelection = validations.minSelection;
  const maxSelection = validations.maxSelection;

  if (minSelection && minSelection.value && value.length < minSelection.value) {
    setValidationError(fieldName, minSelection, results);
  }

  if (maxSelection && maxSelection.value && value.length > maxSelection.value) {
    setValidationError(fieldName, maxSelection, results);
  }
};

export const checkPattern = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const pattern = validations.pattern;
  if (!pattern) return;

  const re = new RegExp(pattern.value);

  const match = re.test(value);
  if (!match) {
    setValidationError(fieldName, pattern, results);
  }
};

export const checkEmail = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const email = validations.email;
  if (!email) return;

  try {
    z.email().parse(value);
  } catch {
    setValidationError(fieldName, email, results);
  }
};

export const checkMinMax = ({
  fieldName,
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
      setValidationError(fieldName, min, results);
    }
  }

  if (max && max.value?.toString().length >= 1) {
    const num = stringToNumCheck(value);
    if (num && num > max.value) {
      setValidationError(fieldName, max, results);
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
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const past = validations.past;
  if (!past) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value >= today) {
    setValidationError(fieldName, past, results);
  }
};

export const checkDatePastOrToday = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const pastOrToday = validations.pastOrToday;
  if (!pastOrToday) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value > today) {
    setValidationError(fieldName, pastOrToday, results);
  }
};

export const checkDateFuture = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const future = validations.future;
  if (!future) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value <= today) {
    setValidationError(fieldName, future, results);
  }
};

export const checkDateFutureOrToday = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const futureOrToday = validations.futureOrToday;
  if (!futureOrToday) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (value < today) {
    setValidationError(fieldName, futureOrToday, results);
  }
};

export const checkDateAfter = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const after = validations.after;
  if (!after || !after.value) return;

  const targetDate = parseDateString(after.value);
  if (!targetDate) return;

  if (value <= targetDate) {
    setValidationError(fieldName, after, results);
  }
};
export const checkDateBefore = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const before = validations.before;
  if (!before || !before.value) return;

  const targetDate = parseDateString(before.value);
  if (!targetDate) return;

  if (value >= targetDate) {
    setValidationError(fieldName, before, results);
  }
};
export const checkDateOnOrAfter = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const onOrAfter = validations.onOrAfter;
  if (!onOrAfter || !onOrAfter.value) return;

  const targetDate = parseDateString(onOrAfter.value);
  if (!targetDate) return;

  if (value < targetDate) {
    setValidationError(fieldName, onOrAfter, results);
  }
};
export const checkDateOnOrBefore = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<Date>) => {
  const onOrBefore = validations.onOrBefore;
  if (!onOrBefore || !onOrBefore.value) return;

  const targetDate = parseDateString(onOrBefore.value);
  if (!targetDate) return;

  if (value > targetDate) {
    setValidationError(fieldName, onOrBefore, results);
  }
};
export const checkMinYear = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<DateValue>) => {
  const minYear = validations.minYear;
  if (!minYear || minYear.value === undefined) return;

  if (value.year < minYear.value) {
    setValidationError(fieldName, minYear, results);
  }
};
export const checkMaxYear = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<DateValue>) => {
  const maxYear = validations.maxYear;
  if (!maxYear || maxYear.value === undefined) return;

  if (value.year > maxYear.value) {
    setValidationError(fieldName, maxYear, results);
  }
};
/*
 * Checks for equality, inequality, greater than and lesser than
 */
const getStepIdFromFieldName = (fieldName: string): string => {
  const lastConcatenatedIndex = fieldName.lastIndexOf(
    `${stepFieldIdConcactenator}`,
  );
  return lastConcatenatedIndex > 0
    ? fieldName.slice(0, lastConcatenatedIndex)
    : "";
};

export const checkComparisons = (
  { fieldName, value, results, validations }: ValidationArgs<string | number>,
  fieldApi: AnyFieldApi,
) => {
  const equal = validations.equal;
  const notEqual = validations.notEqual;

  const gt = validations.gt;
  const lt = validations.lt;

  if (!equal && !notEqual && !gt && !lt) return; // No validations provided

  const currentStepId = getStepIdFromFieldName(fieldApi.name);

  const compare = (
    comp: "equal" | "notEqual" | "gt" | "lt",
    validation?: ValidationConfig,
  ) => {
    if (validation && validation.referenceFieldId) {
      const referenceStepId = validation.referenceStepId ?? currentStepId;
      const referenceFieldId = validation.referenceFieldId;

      const fullReferenceId = getFullFieldId(referenceStepId, referenceFieldId);

      const targetFieldValue = fieldApi.form.getFieldValue(fullReferenceId);
      const passesCondition = evaluateCondition(value, targetFieldValue, comp);
      if (!passesCondition) {
        setValidationError(fieldName, validation, results);
      }
    }
  };

  compare("equal", equal);
  compare("notEqual", notEqual);
  compare("gt", gt);
  compare("lt", lt);
};
export const checkContains = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const contains = validations.contains;
  if (!contains || !contains.value) return;

  const passesCondition = evaluateCondition(value, contains.value, "contains");

  if (!passesCondition) {
    setValidationError(fieldName, contains, results);
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
      if (conditionValue && conditionValue != targetFieldValue) return true;
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
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  const fileTypes = validations.fileTypes;
  if (!fileTypes || fileTypes.value.length === 0) return;

  const allowedExtensions = fileTypes.value.map((type: string) => {
    const parts = type.split("/");
    return parts.length > 1 ? parts[1].toLowerCase() : type.toLowerCase();
  });

  const invalidExtensions = new Set<string>();
  for (const file of value) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension && !allowedExtensions.includes(extension)) {
      invalidExtensions.add(extension);
    }
  }

  if (invalidExtensions.size > 0) {
    setValidationError(
      fieldName,
      fileTypes,
      results,
      `File type not allowed. Allowed types: ${fileTypes.value.join(", ")}.`,
    );
  }
};

export const checkFileMaxSize = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  // Per-file size limit (itemMaxSize)
  const itemMaxSize = validations.itemMaxSize;
  if (itemMaxSize?.value !== undefined) {
    for (const file of value) {
      if (file.size > itemMaxSize.value) {
        setValidationError(fieldName, itemMaxSize, results);
        break; // Report once per field
      }
    }
  }

  // Total size limit across all files (maxSize)
  const maxSize = validations.maxSize;
  if (maxSize?.value !== undefined) {
    const totalSize = Array.from(value).reduce((sum, f) => sum + f.size, 0);
    if (totalSize > maxSize.value) {
      setValidationError(fieldName, maxSize, results);
    }
  }
};

export const checkMaxFiles = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  const maxItems = validations.maxItems;
  if (!maxItems || maxItems.value === undefined) return;

  if (value.length > maxItems.value) {
    setValidationError(
      fieldName,
      maxItems,
      results,
      `Number of files exceeds the maximum allowed (${maxItems.value}).`,
    );
  }
};

export const checkMinFiles = ({
  fieldName,
  value,
  results,
  validations,
}: ValidationArgs<FileList>) => {
  const minItems = validations.minItems;
  if (!minItems || minItems.value === undefined) return;

  if (value.length < minItems.value) {
    setValidationError(
      fieldName,
      minItems,
      results,
      `Number of files is less than the minimum required (${minItems.value}).`,
    );
  }
};
