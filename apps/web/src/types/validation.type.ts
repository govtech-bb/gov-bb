import { ValidationRule } from "@govtech-bb/form-types";
import { ZodObject, ZodType } from "zod";

interface FieldValidationContext<TValue = unknown, TFormApi = unknown> {
  value: TValue;
  formApi?: TFormApi;
}

export interface FieldValidationProperties<
  TValue = unknown,
  TFormApi = unknown,
> {
  onChange?(input: FieldValidationContext<TValue, TFormApi>): void; // Method called when a field's value is changed. Set via validations.
  onBlur?(input: FieldValidationContext<TValue, TFormApi>): void; // Method called when a field loses focus.
  onChangeListenTo?: string[];
}

export interface FieldValidation {
  fieldSchema: ZodType<unknown>;
  properties: FieldValidationProperties;
}

export interface FormValidation {
  schema: ZodObject<Record<string, ZodType<unknown>>>;
  properties: Record<string, FieldValidationProperties>;
  defaults: Record<string, unknown>;
}

export interface ValidationResults {
  hasError: boolean; // Whether any errors were picked up.
  errors: string[]; // Filtered list of results with errors.
}

export interface ValidationArgs<TValueType = unknown> {
  fieldId: string;
  value: TValueType;
  validations: ValidationRule;
  results: ValidationResults;
}
