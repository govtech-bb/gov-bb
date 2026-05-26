import type { FieldOverrides, Behaviour } from "@govtech-bb/form-types";

// Per-child field overrides for a block (keyed by child fieldId)
export type ChildOverrides = Record<string, FieldOverrides>;

export interface RecipeFieldDraft {
  // Editor-only stable instance id. Lets the reducer/editor distinguish two
  // instances of the same `ref` on the same step. NOT persisted: the
  // serializer drops it, and `deserializeRecipe` mints a fresh one for every
  // field. Generate via `crypto.randomUUID()` (browser/Node 19+) at the two
  // entry points to editor state — `ADD_FIELD` and `deserializeRecipe`.
  id: string;
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
  description?: string;
  steps: RecipeStepDraft[];
}
