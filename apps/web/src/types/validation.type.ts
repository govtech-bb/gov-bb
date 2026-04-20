import { ZodObject, ZodType } from "zod";

interface FieldValidationContext<TValue = unknown, TFormApi = unknown> {
  value: TValue;
  formApi?: TFormApi;
}

export interface FieldValidationMethods<TValue = unknown, TFormApi = unknown> {
  onChange?(input: FieldValidationContext<TValue, TFormApi>): void; // Method called when a field's value is changed. Set via validations.
  onBlur?(input: FieldValidationContext<TValue, TFormApi>): void; // Method called when a field loses focus.
}

export interface FieldValidation {
  fieldSchema: ZodType<unknown>;
  methods: FieldValidationMethods;
}

export interface FormValidation {
  schema: ZodObject<Record<string, ZodType<unknown>>>;
  methods: Record<string, FieldValidationMethods>;
  defaults: Record<string, unknown>;
}

export interface ValidationResults {
  hasError: boolean; // Whether any errors were picked up.
  errors: string[]; // Filtered list of results with errors.
}
