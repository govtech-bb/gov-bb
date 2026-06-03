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
  onDynamic?(input: FieldValidationContext<TValue, TFieldApi>): void; // Validation method. revalidateLogic runs it on submit, then on change.
  onBlur?(input: FieldValidationContext<TValue, TFieldApi>): void; // Method called when a field loses focus.
  onChangeListenTo?: string[];
}

type stepId = string;
export interface FormValidation {
  properties: Record<string, FieldValidationProperties>;
  defaults: Record<stepId, FieldValue>;
}

export type FieldValidationErrors = Record<string, string[]>;
