import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
  FieldValidationMethods,
} from "@web/types";
import z from "zod";
import { validate } from "@govtech-bb/form-validation";
import type { Primitive } from "@govtech-bb/form-types";

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
  const primitive = clientPrimitiveToPrimitive(field);

  const fieldSchema = z.any().superRefine((value, ctx) => {
    const result = validate({
      primitives: [primitive],
      stepValues: { [field.name]: value },
    });

    for (const msg of result.errors[field.name] ?? []) {
      ctx.addIssue({ code: "custom", message: msg });
    }
  });

  return {
    fieldSchema,
    methods: buildFieldValidationMethods(field),
  };
};

export const buildFieldValidationMethods = (
  field: ClientPrimitive,
): FieldValidationMethods => {
  return {
    onBlur(value, formApi) {},
    onChange(value, formApi) {},
  };
};

function clientPrimitiveToPrimitive(field: ClientPrimitive): Primitive {
  return {
    fieldId: field.name,
    label: field.label,
    htmlType: field.htmlType,
    validations: field.validations,
    ...(field.options && { options: field.options }),
  } as Primitive;
}
