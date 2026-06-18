import type {
  FieldOverrides,
  Behaviour,
  Processor,
  ContactDetails,
  FormStep,
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
  // Confirmation-step content. The submission-confirmation step renders
  // `markdownContent` (editable in StepEditor) and `nextSteps` (structured
  // title/content/items blocks). Both are dropped from the served contract on
  // republish unless round-tripped here (#1292): markdownContent is authored in
  // the builder, while nextSteps is carried through untouched (no editor yet).
  markdownContent?: string;
  nextSteps?: FormStep["nextSteps"];
}

// Editor-only id mirrors RecipeFieldDraft.id: minted on deserialize, stripped on
// serialize, never persisted (per ADR 0009). Intersecting with the Processor
// discriminated union keeps the `type` discriminant intact across all members.
export type RecipeProcessorDraft = Processor & { id: string };

// The processor types the builder can author. `payment` is now authorable
// (#716): its config is editable in the builder and persisted to the DB sibling
// `form_config.config` (never the recipe), unlike the other types which live in
// the recipe.
//
export type AuthorableProcessorType = Processor["type"];

export interface RecipeDraft {
  formId: string;
  title: string;
  description?: string;
  // Service "Contact Details" shown on the citizen-facing form (issue #452).
  // A single optional structured object — no editor-only id, unlike processors.
  // Round-tripped with the same `!== undefined` guard so absent stays distinct.
  contactDetails?: ContactDetails;
  // The selected per-environment MDA contact (issue #607). DB-only: it is
  // persisted to `form_config` and travels as a sibling field of the save
  // request, NEVER inside the serialized recipe/ServiceContractRecipe — so
  // serializeRecipeDraft must not emit it. `null` means "explicitly none";
  // `undefined`/absent means "untouched".
  mdaContactId?: string | null;
  steps: RecipeStepDraft[];
  // Carried through with an editor-only id per entry (issue #255). Serializer
  // drops the id; deserialize mints a fresh one. Authoring UI: Session 2.
  processors?: RecipeProcessorDraft[];
}
