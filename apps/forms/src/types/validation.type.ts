import { FieldValue } from "@govtech-bb/form-types";
import { AnyFieldApi } from "@tanstack/react-form";

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

type stepId = string;
export interface FormValidation {
  properties: Record<string, FieldValidationProperties>;
  defaults: Record<stepId, FieldValue>;
}

export type FieldValidationErrors = Record<string, string[]>;
