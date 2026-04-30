import { ValidationRule } from "@govtech-bb/form-types";
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
  onChange?(input: FieldValidationContext<TValue, TFieldApi>): void; // Method called when a field's value is changed. Set via validations.
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
  fieldLabel: string;
  value: TValueType;
  validations: ValidationRule;
  results: ValidationResults;
}

export type FieldValidationErrors = Record<string, string[]>;

export interface DateValueInput {
  day?: number;
  month?: number;
  year?: number;
}

export interface DateValue {
  day: number;
  month: number;
  year: number;
}

export type FieldValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | DateValueInput;
