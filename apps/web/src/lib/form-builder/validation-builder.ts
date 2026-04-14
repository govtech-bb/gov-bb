import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
} from "@web/types";
import z from "zod";
import { FieldValidationMethods } from "../../types/validation.type";

export const buildValidation = (
  contract: ClientServiceContract,
): FormValidation => {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const fieldValidationMethods: Record<string, FieldValidationMethods> = {};
  const defaults: Record<string, unknown> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      const { zodSchema, methods } = buildFieldValidation(field);
      shape[field.name] = zodSchema;
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
  let schema: z.ZodType<unknown> = z.object({});
  return {
    zodSchema: schema,
    methods: {
      onBlur(value, formApi) {},
      onChange(value, formApi) {},
    },
  };
};
