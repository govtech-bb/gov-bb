import type { FieldOverrides, Behaviour } from "@govtech-bb/form-types";

// Per-child field overrides for a block (keyed by child fieldId)
export type ChildOverrides = Record<string, FieldOverrides>;

export interface RecipeFieldDraft {
  kind: "component" | "block" | "custom";
  ref: string; // e.g. "components/first-name", "blocks/name"
  overrides: FieldOverrides;
  childOverrides?: ChildOverrides; // for blocks only
}

export interface RecipeStepDraft {
  stepId: string;
  title: string;
  description?: string;
  fields: RecipeFieldDraft[];
  behaviours: Behaviour[];
}

export interface RecipeDraft {
  formId: string;
  title: string;
  steps: RecipeStepDraft[];
}
