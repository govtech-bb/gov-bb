import { FieldValue, ValidationRule } from "@govtech-bb/form-types";
import { AnyFieldApi } from "@tanstack/react-form";
import { ZodObject, ZodType } from "zod";

interface FieldValidationContext<TValue = unknown, TFieldApi = unknown> {
  value: TValue;
  fieldApi: TFieldApi;
}

export interface FieldValidationProperties<
  TValue = FieldValue,
  TFieldApi = AnyFieldApi,
> {
  onDynamic?(input: FieldValidationContext<TValue, TFieldApi>): void; // Validation method. revalidateLogic runs it on submit, then on change.
  onBlur?(input: FieldValidationContext<TValue, TFieldApi>): void; // Method called when a field loses focus.
  onChangeListenTo?: string[];
}

export interface FieldValidation {
  fieldSchema: ZodType<unknown>;
  properties: FieldValidationProperties;
}

type stepId = string;
export interface FormValidation {
  schema: ZodObject<Record<string, ZodType<unknown>>>;
  properties: Record<string, FieldValidationProperties>;
  defaults: Record<stepId, FieldValue>;
}

export interface ValidationResults {
  hasError: boolean; // Whether any errors were picked up.
  errors: string[]; // Filtered list of results with errors.
}

export interface ValidationArgs<TValueType = unknown> {
  fieldId: string;
  fieldName: string;
  value: TValueType;
  validations: ValidationRule;
  results: ValidationResults;
}

export type FieldValidationErrors = Record<string, string[]>;
