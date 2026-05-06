import { ValidationRule } from "@govtech-bb/form-types";
import { AnyFieldApi } from "@tanstack/react-form";
import { ZodObject, ZodType, z } from "zod";

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
  fieldName: string;
  value: TValueType;
  validations: ValidationRule;
  results: ValidationResults;
}

export type FieldValidationErrors = Record<string, string[]>;

const dateValueInputSchema = z.object({
  day: z.number().optional(),
  month: z.number().optional(),
  year: z.number().optional(),
});

export type DateValueInput = z.infer<typeof dateValueInputSchema>;

export interface DateValue {
  day: number;
  month: number;
  year: number;
}

export const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
  dateValueInputSchema,
]);

export type FieldValue = z.infer<typeof fieldValueSchema>;
