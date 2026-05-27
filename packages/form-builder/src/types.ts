import type {
  FieldOverrides,
  Behaviour,
  Processor,
} from "@govtech-bb/form-types";

// Per-child field overrides for a block (keyed by child fieldId)
export type ChildOverrides = Record<string, FieldOverrides>;

export interface RecipeFieldDraft {
  // Editor-only; not persisted. Serializer drops it, deserialize mints a fresh one.
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
  // Carried through unchanged so re-deploying a form never wipes processors
  // authored elsewhere (issue #255). No builder UI yet — see Session 2.
  processors?: Processor[];
}
