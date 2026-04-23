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
  checkConditionalOn,
  checkLength,
  checkPattern,
  checkEmail,
  checkMinMax,
  checkComparisons,
  checkContains,
} from "./validation-methods";
import { AnyFieldApi } from "@tanstack/react-form";
import { ValidationRule } from "@govtech-bb/form-types";

export const buildValidation = (
  contract: ClientServiceContract,
): FormValidation => {
  const shape: Record<string, z.ZodType<unknown>> = {};
  const fieldValidationProperties: Record<string, FieldValidationProperties> =
    {};
  const defaults: Record<string, unknown> = {};

  for (const step of contract.steps) {
    for (const field of step.fields) {
      const { fieldSchema, properties } = buildFieldValidation(field);
      shape[field.name] = fieldSchema;
      fieldValidationProperties[field.name] = properties;
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
    onBlur({ value, fieldApi }) {
      const results: ValidationResults = {
        hasError: false,
        errors: [],
      };

      const fieldId = field.id;
      if (field.htmlType === "date") {
        const dateValueInput = value as DateValueInput;
        if (
          !isDateComplete({
            value: dateValueInput,
            fieldId,
            validations,
            results,
          })
        )
          return;

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

      let conditionalRequired: boolean = false;

      if (behaviours && behaviours.length > 0) {
        const fieldConditionalOns = behaviours.filter(
          (b) => b.type === "fieldConditionalOn",
        );

        if (fieldConditionalOns.length > 0) {
          // Checks if there is a field conditional on, that passes and affect required state
          conditionalRequired = checkConditionalOn(
            field.id,
            value,
            fieldConditionalOns,
            results,
            fieldApi,
          );

          if (conditionalRequired) {
            if (!validations.required)
              validations.required = {
                value: true,
                error: `${field.id} is required.`,
              };
          }
        }
      }

      checkRequired({ fieldId: field.id, value, results, validations });
      // If the field is required, but has no value, then skip subsequent error checks
      if (results.hasError) return results.errors;

      if (field.htmlType === "date") {
        // If it passes the required check, then it has all 3 parts
        runDateValidations(field.id, value as DateValue, validations, results);
        return results.hasError ? results.errors : undefined;
      }

      if (field.htmlType === "checkbox") {
        if (typeof value !== "boolean" || !Array.isArray(value))
          return undefined;
        runCheckboxValidations(field.id, value, validations, results);
        return results.hasError ? results.errors : undefined;
      }

      if (typeof value === "string") {
        const args: ValidationArgs<string> = {
          fieldId: field.id,
          value,
          validations,
          results,
        };

        runStringValidations(args, fieldApi);
      }

      return results.hasError ? results.errors : undefined;
    },
    onChangeListenTo: listenTo,
  };
};

const runDateValidations = (
  fieldId: string,
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
    validations,
    results,
  };

  checkMinYear(argsDateValue);
  checkMaxYear(argsDateValue);
};

const runCheckboxValidations = (
  fieldId: string,
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
    });
  }
};

const runStringValidations = (
  args: ValidationArgs<string>,
  fieldApi: AnyFieldApi,
) => {
  checkLength(args);
  checkPattern(args);
  checkEmail(args);
  checkMinMax(args);
  checkComparisons(args, fieldApi);
  checkContains(args);
};
