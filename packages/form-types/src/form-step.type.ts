import type { FieldOverrides, Primitive } from "./primitive.type";
import type { Behaviour } from "./behavior.type";

export interface FormStep {
  stepId: string;
  title: string;
  description?: string;
  elements: Array<Primitive>;
  behaviours?: Array<Behaviour>;
}

export interface RecipeComponentField {
  ref: `components/${string}`;
  overrides?: FieldOverrides;
}

export interface RecipeBlockField {
  ref: `blocks/${string}`;
  overrides?: Record<string, FieldOverrides>;
}

export type RecipeFormStepField = RecipeComponentField | RecipeBlockField;

export interface RecipeFormStep extends Omit<FormStep, "elements"> {
  elements: Array<RecipeFormStepField>;
}
