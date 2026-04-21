import {
  Behaviour,
  EqualityOperations,
  ValidationConfig,
} from "@govtech-bb/form-types";
import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
  FieldValidationProperties,
  ValidationResults,
  ValidationArgs,
} from "@web/types";
import z from "zod";

export const buildValidation = (
  contract: ClientServiceContract,
): FormValidation => {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const fieldValidationMethods: Record<string, FieldValidationProperties> = {};
  const defaults: Record<string, unknown> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      const { fieldSchema, properties: methods } = buildFieldValidation(field);
      shape[field.name] = fieldSchema;
      fieldValidationMethods[field.name] = methods;
      if (field.defaultValue) {
        defaults[field.id] = field.defaultValue;
      }
    }
  }

  return {
    schema: z.object(shape),
    properties: fieldValidationMethods,
    defaults,
  };
};

export const buildFieldValidation = (
  field: ClientPrimitive,
): FieldValidation => {
  // TODO: Flesh this out based on field validation methods.
  const fieldSchema: z.ZodType<unknown> = z.object({});
  const properties = buildFieldValidationProperties(field);
  return {
    fieldSchema,
    properties,
  };
};

// This allows us to recalculate the methods after restoring from cache.
export const buildFieldValidationProperties = (
  field: ClientPrimitive,
): FieldValidationProperties => {
  if (!field.validations) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onBlur(_input) {},
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onChange(_input) {},
    };
  }
  const validations = field.validations;
  const behaviours = field.behaviours;

  const listenTo =
    behaviours?.flatMap((b) =>
      "targetFieldId" in b ? [b.targetFieldId] : [],
    ) ?? [];

  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onBlur(_input) {},
    onChange({ value, fieldApi }) {
      const results: ValidationResults = {
        hasError: false,
        errors: [],
      };

      if (field.htmlType === "checkbox") {
        if (Array.isArray(value)) {
          const args: ValidationArgs<string[]> = {
            fieldId: field.id,
            value,
            validations,
            results,
          };

          checkSelectionLength(args);
        } else {
          checkRequired({
            fieldId: field.id,
            value: Boolean(value),
            results,
            validations,
          });
        }
        return results.hasError ? results.errors : undefined;
      }
      if (typeof value === "string") {
        const args: ValidationArgs<string> = {
          fieldId: field.id,
          value,
          validations,
          results,
        };

        let isRequired: boolean = validations.required?.value ?? false;

        if (behaviours && behaviours.length > 0) {
          isRequired = checkConditionalOn(
            field.id,
            value,
            behaviours,
            results,
            fieldApi,
          );
        }

        if (isRequired === false && value.length === 0) return undefined;
        if (isRequired && !results.hasError) {
          checkRequired(args);
        }

        // If the field is required, but has no value, then ignore subsequent errors
        if (results.hasError) return results.errors;
        checkLength(args);
        checkPattern(args);
        checkEmail(args);
        checkMinMax(args);
      }

      return results.hasError ? results.errors : undefined;
    },
    onChangeListenTo: listenTo,
  };
};

// Modular Methods

const getValidationErrorOr = (
  fieldId: string,
  config: ValidationConfig,
  customError?: string,
): string =>
  (config.error || customError) ?? `Unknown error has occurred for ${fieldId}`;

const checkRequired = ({
  fieldId,
  value,
  results,
  validations,
}: ValidationArgs<string | boolean | number>) => {
  if (
    validations.required &&
    validations.required.value &&
    ((typeof value === "string" && value.length === 0) ||
      (typeof value === "boolean" && value !== true) ||
      (typeof value === "number" && value.toString().length === 0))
  ) {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, validations.required));
  }
};

const checkLength = ({
  fieldId,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const minLength = validations.minLength || null;
  const maxLength = validations.maxLength || null;

  if (minLength && minLength.value && value.length < minLength.value) {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, minLength));
  }

  if (maxLength && maxLength.value && value.length > maxLength.value) {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, maxLength));
  }
};

const checkSelectionLength = ({
  fieldId,
  value,
  results,
  validations,
}: ValidationArgs<string[]>) => {
  const minSelection = validations.minSelection || null;
  const maxSelection = validations.maxSelection || null;

  if (minSelection && minSelection.value && value.length < minSelection.value) {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, minSelection));
  }

  if (maxSelection && maxSelection.value && value.length > maxSelection.value) {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, maxSelection));
  }
};

const checkPattern = ({
  fieldId,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const pattern = validations.pattern || null;
  if (!pattern) return;

  const re = new RegExp(pattern.value);

  const match = re.test(value);
  if (!match) {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, pattern));
  }
};

const checkEmail = ({
  fieldId,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  const email = validations.email || null;
  if (!email) return;

  try {
    z.email().parse(value);
  } catch {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, email));
  }
};

const checkMinMax = ({
  fieldId,
  value,
  results,
  validations,
}: ValidationArgs<string | number>) => {
  const min = validations.min || null;
  const max = validations.max || null;

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
      results.hasError = true;
      results.errors.push(getValidationErrorOr(fieldId, min));
    }
  }

  if (max && max.value?.toString().length >= 1) {
    const num = stringToNumCheck(value);
    if (num && num > max.value) {
      results.hasError = true;
      results.errors.push(getValidationErrorOr(fieldId, max));
    }
  }
};

const checkConditionalOn = (
  fieldId: string,
  value: any,
  behaviours: Behaviour[],
  results: ValidationResults,
  fieldApi: any,
): boolean => {
  const fieldConditionalOns = behaviours.filter(
    (b) => b.type === "fieldConditionalOn",
  );
  if (fieldConditionalOns.length === 0) return false;

  let isRequired: boolean = false;

  for (const condition of fieldConditionalOns) {
    const cValue = condition.value;
    const otherValue = fieldApi.form.getFieldValue(condition.targetFieldId);
    const passesCondition = evaluateCondition(
      cValue,
      otherValue,
      condition.operator,
    );
    if (passesCondition && value.toString().length == 0) {
      results.hasError = true;
      results.errors = [
        `${fieldId} is required because the value of ${condition.targetFieldId} is ${condition.operator} ${cValue}`,
      ];
      isRequired = true;
    }
  }

  return isRequired;
};

const evaluateCondition = (
  sourceValue: any,
  targetValue: string | any[],
  operation: EqualityOperations,
): boolean => {
  console.log(sourceValue, targetValue);
  console.log(sourceValue == targetValue);
  switch (operation) {
    case "in":
    case "exists":
      if (targetValue.includes(sourceValue)) return true;
      else return false;
    case "equal":
      if (sourceValue == targetValue) return true;
      else return false;
    case "notEqual":
      if (sourceValue != targetValue) return true;
      else return false;
    default:
      return false;
  }
};
