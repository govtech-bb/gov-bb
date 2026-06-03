import type {
  FieldOverrides,
  Behaviour,
  Processor,
  ContactDetails,
} from "@govtech-bb/form-types";

// Per-child field overrides for a block (keyed by child fieldId)
export type ChildOverrides = Record<string, FieldOverrides>;

export interface RecipeFieldDraft {
  // Editor-only; not persisted. Serializer drops it, deserialize mints a fresh one.
  id: string;
  kind: "component" | "block" | "custom";
  ref: string; // e.g. "components/first-name", "blocks/personal-information"
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

// Editor-only id mirrors RecipeFieldDraft.id: minted on deserialize, stripped on
// serialize, never persisted (per ADR 0009). Intersecting with the Processor
// discriminated union keeps the `type` discriminant intact across all members.
export type RecipeProcessorDraft = Processor & { id: string };

// The processor types the builder can author. `payment` is intentionally not
// authorable in the UI (issue #255 Session 2): an existing payment processor is
// shown read-only and round-trips intact, but new ones aren't created here.
export type AuthorableProcessorType = Exclude<Processor["type"], "payment">;

export interface RecipeDraft {
  formId: string;
  title: string;
  description?: string;
  // Service "Contact Details" shown on the citizen-facing form (issue #452).
  // A single optional structured object — no editor-only id, unlike processors.
  // Round-tripped with the same `!== undefined` guard so absent stays distinct.
  contactDetails?: ContactDetails;
  steps: RecipeStepDraft[];
  // Carried through with an editor-only id per entry (issue #255). Serializer
  // drops the id; deserialize mints a fresh one. Authoring UI: Session 2.
  processors?: RecipeProcessorDraft[];
}
