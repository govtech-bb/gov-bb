import { ValidationConfig, ValidationRule } from "@govtech-bb/form-types";
import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
  FieldValidationMethods,
  ValidationResults,
} from "@web/types";
import z from "zod";

export const buildValidation = (
  contract: ClientServiceContract,
): FormValidation => {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const fieldValidationMethods: Record<string, FieldValidationMethods> = {};
  const defaults: Record<string, unknown> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      const { fieldSchema, methods } = buildFieldValidation(field);
      shape[field.name] = fieldSchema;
      fieldValidationMethods[field.name] = methods;
      if (field.defaultValue) {
        defaults[field.id] = field.defaultValue;
      }
    }
  }

  return {
    schema: z.object(shape),
    methods: fieldValidationMethods,
    defaults,
  };
};

export const buildFieldValidation = (
  field: ClientPrimitive,
): FieldValidation => {
  // TODO: Flesh this out based on field validation methods.
  const fieldSchema: z.ZodType<unknown> = z.object({});
  const methods = buildFieldValidationMethods(field);
  return {
    fieldSchema,
    methods,
  };
};

// This allows us to recalculate the methods after restoring from cache.
export const buildFieldValidationMethods = (
  field: ClientPrimitive,
): FieldValidationMethods => {
  if (!field.validations) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onBlur(_input) {},
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onChange(_input) {},
    };
  }
  const validations = field.validations;

  return {
    onBlur(input) {},
    onChange({ value }) {
      const results: ValidationResults = {
        hasError: false,
        errors: [],
      };
      if (typeof value === "string") {
        checkLength(field.id, value, validations, results);
        checkPattern(field.id, value, validations, results);
      }

      return results.hasError ? results.errors : undefined;
    },
  };
};

// Modular Methods

const getValidationErrorOr = (
  fieldId: string,
  config: ValidationConfig,
  customError?: string,
): string =>
  (config.error || customError) ?? `Unknown error has occurred for ${fieldId}`;

const checkLength = (
  fieldId: string,
  value: string,
  validations: ValidationRule,
  results: ValidationResults,
): ValidationResults => {
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

  return results;
};

const checkPattern = (
  fieldId: string,
  value: string,
  validations: ValidationRule,
  results: ValidationResults,
): ValidationResults => {
  const pattern = validations.pattern || null;
  if (!pattern) return results;

  const re = new RegExp(pattern.value);

  const match = re.test(value);
  if (!match) {
    results.hasError = true;
    results.errors.push(getValidationErrorOr(fieldId, pattern));
  }

  return results;
};
