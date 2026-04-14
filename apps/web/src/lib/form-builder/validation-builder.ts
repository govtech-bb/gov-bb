import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
  FieldValidationMethods,
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
  let fieldSchema: z.ZodType<unknown> = z.object({});
  let methods = buildFieldValidationMethods(field);
  return {
    fieldSchema,
    methods,
  };
};

// This allows us to recalculate the methods after restoring from cache.
export const buildFieldValidationMethods = (
  field: ClientPrimitive,
): FieldValidationMethods => {
  return {
    onBlur(value, formApi) {},
    onChange(value, formApi) {},
  };
};
