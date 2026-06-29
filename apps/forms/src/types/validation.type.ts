import { FieldValue } from "@govtech-bb/form-types";
import type { DateValidationError } from "@govtech-bb/form-validation";
import { AnyFieldApi } from "@tanstack/react-form";

/**
 * One entry in a field's TanStack error array: plain message strings for most
 * fields, a structured { message, parts } object for date fields (so the
 * renderer can highlight the failing day/month/year inputs).
 */
type FieldError = string | DateValidationError;

interface FieldValidationContext<TValue = unknown, TFieldApi = unknown> {
  value: TValue;
  fieldApi: TFieldApi;
}

export interface FieldValidationProperties<
  TValue = FieldValue,
  TFieldApi = AnyFieldApi,
> {
  /**
   * Validation method. revalidateLogic runs it on submit, then on change.
   * Returns the field's errors, or undefined when valid.
   */
  onDynamic?(
    input: FieldValidationContext<TValue, TFieldApi>,
  ): FieldError[] | undefined;
  onBlur?(input: FieldValidationContext<TValue, TFieldApi>): void; // Method called when a field loses focus.
  onChangeListenTo?: string[];
}

type stepId = string;
export interface FormValidation {
  properties: Record<string, FieldValidationProperties>;
  defaults: Record<stepId, FieldValue>;
}

export type FieldValidationErrors = Record<string, string[]>;
