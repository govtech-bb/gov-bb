export interface ValidationConfig {
  error?: string;
  value?: any;
  reference?: string;
}

export type ValidationType =
  | "required"
  | "minLength"
  | "maxLength"
  | "pattern"
  | "min"
  | "max"
  | "conditionalOn"
  | "past"
  | "pastOrToday"
  | "future"
  | "futureOrToday"
  | "after"
  | "before"
  | "onOrAfter"
  | "onOrBefore"
  | "minYear"
  | "maxYear"
  | "minItems"
  | "maxItems"
  | "radio"
  | "minSelection"
  | "maxSelection"
  | "email"
  | "fileTypes"
  | "itemMaxSize"
  | "maxSize"
  | "equal"
  | "notEqual"
  | "gt"
  | "lt"
  | "contains"
  | "strictEquality";

export type ValidationRule = Partial<Record<ValidationType, ValidationConfig>>;
