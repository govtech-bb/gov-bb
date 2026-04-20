import { ValidationConfig } from "@govtech-bb/form-types";
import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
  FieldValidationMethods,
  ValidationResults,
  ValidationArgs,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onBlur(_input) {},
    onChange({ value }) {
      const results: ValidationResults = {
        hasError: false,
        errors: [],
      };
      if (typeof value === "string") {
        const args: ValidationArgs<string> = {
          fieldId: field.id,
          value,
          validations,
          results,
        };
        if (
          validations.required &&
          validations.required.value === false &&
          value.length == 0
        )
          return undefined;
        checkRequired(args);
        // If the field is required, but has no value, then ignore subsequent errors
        if (results.hasError) return results.errors;
        checkLength(args);
        checkPattern(args);
        checkEmail(args);
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

const checkRequired = ({
  fieldId,
  value,
  results,
  validations,
}: ValidationArgs<string>) => {
  if (
    validations.required &&
    validations.required.value &&
    value.length === 0
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
