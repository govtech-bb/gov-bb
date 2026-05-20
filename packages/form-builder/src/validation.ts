import type { ValidationIssue } from "@govtech-bb/form-types";

export {
  validateFormContract,
  type ValidationResult,
  type ValidationIssue,
} from "@govtech-bb/form-types";

export type RecipeValidateResponse = {
  valid: boolean;
  issues: ValidationIssue[];
};
