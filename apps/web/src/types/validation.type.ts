import { ZodObject, ZodType } from "zod";

export interface FieldValidationMethods {
  onChange?(value: unknown, formApi: unknown): void;
  onBlur?(value: unknown, formApi: unknown): void;
}

export interface FieldValidation {
  zodSchema: ZodType<unknown>;
  methods: FieldValidationMethods;
}


export interface FormValidation {
  schema: ZodObject<Record<string, ZodType<unknown>>>;
  methods: Record<string, FieldValidationMethods>;
  defaults: Record<string, unknown>;
}
