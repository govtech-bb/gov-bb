import {
  ClientServiceContract,
  ClientPrimitive,
  FieldValidation,
  FormValidation,
  FieldValidationProperties,
  ValidationResults,
  ValidationArgs,
  DateValue,
  DateValueInput,
  FieldValue,
} from "@web/types";
import z from "zod";
import {
  isDateComplete,
  dateValueToDate,
  checkDatePast,
  checkDatePastOrToday,
  checkDateFuture,
  checkDateFutureOrToday,
  checkDateAfter,
  checkDateBefore,
  checkDateOnOrAfter,
  checkDateOnOrBefore,
  checkMinYear,
  checkMaxYear,
  checkSelectionLength,
  checkRequired,
  checkLength,
  checkPattern,
  checkEmail,
  checkMinMax,
  checkComparisons,
  checkContains,
} from "./validation-methods";
import { AnyFieldApi } from "@tanstack/react-form";
import { ValidationRule } from "@govtech-bb/form-types";
import { validate } from "@govtech-bb/form-validation";
import type { Primitive } from "@govtech-bb/form-types";

export const buildValidation = (
  contract: ClientServiceContract,
): FormValidation => {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const fieldValidationProperties: Record<string, FieldValidationProperties> =
    {};
  const defaults: Record<string, FieldValue> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      const { fieldSchema, properties } = buildFieldValidation(field);
      shape[field.id] = fieldSchema;
      fieldValidationProperties[field.id] = properties;
      if (field.defaultValue) {
        defaults[field.id] = field.defaultValue;
      }
    }
  }

  return {
    schema: z.object(shape),
    properties: fieldValidationProperties,
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

  const properties = buildFieldValidationProperties(field);

  return {
    fieldSchema,
    properties,
  };
};

const clientPrimitiveToPrimitive = (field: ClientPrimitive): Primitive => {
  return {
    fieldId: field.name,
    label: field.label,
    htmlType: field.htmlType,
    validations: field.validations,
    ...(field.options && { options: field.options }),
  } as Primitive;
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
    onBlur({ value, fieldApi }) {
      if (field.htmlType === "date") {
        const dateValueInput = value as DateValueInput;
        if (!isDateComplete(dateValueInput)) return;

        const dateValue: DateValue = value as DateValue;
        const date: Date | null = dateValueToDate(dateValue);
        if (!date) return;

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // Used if the user enters a date like 10/13/2008,
        // which when converted to a date object, will be 10/1/2009
        // Aim is to have the field reflect that change.
        if (
          year != dateValue.year ||
          month != dateValue.month ||
          day != dateValue.day
        )
          fieldApi.handleChange({ day, month, year });
        return undefined;
      }
    },
    onChange({ value, fieldApi }) {
      const results: ValidationResults = {
        hasError: false,
        errors: [],
      };

      const requiredState = checkRequired({
        fieldId: field.id,
        fieldLabel: field.label,
        value,
        results,
        validations,
      });

      if (requiredState === "unknownState") return undefined; // Or something

      // If the field is required, but has no value, then skip subsequent error checks and show error.
      if (requiredState === "requiredAndEmpty" || results.hasError)
        return results.errors;

      // If field is not required, and is empty, then skip subsequent error checks and show no error
      if (requiredState === "notRequiredAndEmpty") return undefined;

      // If requiredState === notEmpty, then we can continue validation

      if (field.htmlType === "date") {
        // If it passes the required check, then it has all 3 parts
        runDateValidations(
          field.id,
          field.label,
          value as DateValue,
          validations,
          results,
        );
        return results.hasError ? results.errors : undefined;
      }

      if (field.htmlType === "checkbox") {
        if (typeof value !== "boolean" && !Array.isArray(value))
          return undefined;
        runCheckboxValidations(
          field.id,
          field.label,
          value as boolean | string[],
          validations,
          results,
        );
        return results.hasError ? results.errors : undefined;
      }

      if (typeof value === "string") {
        runStringValidations(
          field.id,
          field.label,
          value as string,
          validations,
          results,
          fieldApi,
        );
      }

      // Handling field arrays
      if (Array.isArray(value)) {
        const elements = value;

        for (const element of elements) {
          if (typeof element === "string") {
            if (element.length === 0) continue;
            runStringValidations(
              field.id,
              field.label,
              element,
              validations,
              results,
              fieldApi,
            );
          }
        }
      }

      return results.hasError ? results.errors : undefined;
    },
    onChangeListenTo: listenTo,
  };
};

const runDateValidations = (
  fieldId: string,
  fieldLabel: string,
  value: DateValue,
  validations: ValidationRule,
  results: ValidationResults,
) => {
  const dateValue: DateValue = value as DateValue;
  const date: Date | null = dateValueToDate(dateValue);
  if (!date) {
    results.hasError = true;
    results.errors.push(`${fieldId} is an invalid date`);
    return;
  }

  const argsDate: ValidationArgs<Date> = {
    value: date,
    fieldId,
    fieldLabel,
    validations,
    results,
  };

  checkDatePast(argsDate);
  checkDatePastOrToday(argsDate);
  checkDateFuture(argsDate);
  checkDateFutureOrToday(argsDate);
  checkDateAfter(argsDate);
  checkDateBefore(argsDate);
  checkDateOnOrAfter(argsDate);
  checkDateOnOrBefore(argsDate);

  const argsDateValue: ValidationArgs<DateValue> = {
    value: dateValue,
    fieldId,
    fieldLabel,
    validations,
    results,
  };

  checkMinYear(argsDateValue);
  checkMaxYear(argsDateValue);
};

const runCheckboxValidations = (
  fieldId: string,
  fieldLabel: string,
  value: string[] | boolean,
  validations: ValidationRule,
  results: ValidationResults,
) => {
  if (Array.isArray(value)) {
    checkSelectionLength({
      fieldId,
      value,
      validations,
      results,
      fieldLabel,
    });
  }
};

const runStringValidations = (
  fieldId: string,
  fieldLabel: string,
  value: string,
  validations: ValidationRule,
  results: ValidationResults,
  fieldApi: AnyFieldApi,
) => {
  const args: ValidationArgs<string> = {
    fieldId,
    fieldLabel,
    value,
    validations,
    results,
  };

  checkLength(args);
  checkPattern(args);
  checkEmail(args);
  checkMinMax(args);
  checkComparisons(args, fieldApi);
  checkContains(args);
};
