import { ClientServiceContract, ClientPrimitive, FieldValidation, FormValidation } from '@web/types';
import z from 'zod';

import { FieldValidationMethods } from '../../types/validation.type';
export const buildValidation = (contract: ClientServiceContract): FormValidation => {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const fieldValidationMethods: Record<string, FieldValidationMethods> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      const { zodSchema, methods } = buildFieldValidation(field);
      shape[field.name] = zodSchema;
      fieldValidationMethods[field.name] = methods;
    }
  }

  return {
    schema: z.object(shape),
    methods: fieldValidationMethods
  }
}

export const buildFieldValidation = (field: ClientPrimitive): FieldValidation => {
  let schema: z.ZodType<unknown>;
  // TODO: Flesh this out based on field validation methods.
  throw new Error("Not Implemented");
}
