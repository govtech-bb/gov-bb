import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
  FieldValidationMethods,
} from "@web/types";
import z from "zod";

export const buildValidation = async (
  contract: ClientServiceContract,
): Promise<FormValidation> => {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const fieldValidationMethods: Record<string, FieldValidationMethods> = {};
  const defaults: Record<string, unknown> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      const { fieldSchema, methods } = await buildFieldValidation(field);
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

export const buildFieldValidation = async (
  field: ClientPrimitive,
): Promise<FieldValidation> => {
  // TODO: Flesh this out based on field validation methods.
  let fieldSchema: z.ZodType<unknown> = z.object({});
  let methods = await buildFieldValidationMethods(field);
  return {
    fieldSchema,
    methods,
  };
};

// This allows us to recalculate the methods after restoring from cache.
export const buildFieldValidationMethods = async (
  field: ClientPrimitive,
): Promise<FieldValidationMethods> => {
  return {
    onBlur(value, formApi) {},
    onChange(value, formApi) {},
  };
};
