import { ZodObject, ZodType } from "zod";

export interface FieldValidationMethods {
  onChange?(value: unknown, formApi: unknown): void; // Method called when a field's value is changed. Set via validations.
  onBlur?(value: unknown, formApi: unknown): void; // Method called when a field loses focus.
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
