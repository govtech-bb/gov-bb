export * from "./ai";

// Types
export type {
  RecipeDraft,
  RecipeStepDraft,
  RecipeFieldDraft,
  RecipeProcessorDraft,
  AuthorableProcessorType,
  ChildOverrides,
} from "./types";

// Catalog
export { getCatalog, getRegistryItem } from "./catalog";
export type {
  RegistryCatalog,
  ComponentDefinition,
  BlockDefinition,
  CustomComponentEntry,
} from "./catalog";

// Single-slot TTL cache shared by the builder catalog memoizers
export { ttlCache } from "./ttl-cache";

// Behaviors
export { BEHAVIOUR_TYPE_DESCRIPTORS } from "./behaviors/behaviour-builder";
export type {
  BehaviourTypeDescriptor,
  BehaviourParamDescriptor,
  BehaviourScope,
  ParamKind,
} from "./behaviors/behaviour-builder";
export { VALIDATION_RULE_DESCRIPTORS } from "./behaviors/validation-builder";
export type { ValidationRuleDescriptor } from "./behaviors/validation-builder";

// Processor authoring defaults
export { makeDefaultProcessor } from "./processor-defaults";

// Payment processors as a DB sibling (#716): reconcile recipe + DB on open,
// split them back apart on save.
export {
  mergeDbProcessors,
  extractDbProcessors,
  firstIncompletePaymentProcessor,
} from "./processor-config";

// Core utilities
export {
  hydrateForm,
  collectUnknownRefs,
  collectGenericRequiredMessages,
} from "./resolution";
export type { GenericRequiredMessage } from "./resolution";
// Re-exported so a consumer of GenericRequiredMessage can name the type of
// its `defect` field without depending on @govtech-bb/form-validation.
export type { RequiredMessageDefect } from "@govtech-bb/form-validation";
// Same reason, for the authoring surfaces: the editor's generic-message
// warning has to test the wording the Deploy gate tests, or it stays silent
// on copy the gate will reject (#2715).
export { isFieldlessRequiredWording } from "@govtech-bb/form-validation";
export { UnknownRefError } from "./errors";
export type { UnknownRef } from "./errors";
export { serializeRecipeDraft, deserializeRecipe } from "./serialization";
export { validateFormContract } from "./validation";
export type {
  ValidationResult,
  ValidationIssue,
  RecipeValidateResponse,
} from "./validation";

// Duplicate id detection (fieldId/stepId uniqueness)
export {
  resolveFieldIds,
  findDuplicateFieldIds,
  findDuplicateStepIds,
  findRecipeIdCollisions,
  findRecipeIdCollisionsFromRecipe,
  formatCollisionIssues,
  fieldIdDuplicatesAnother,
} from "./duplicate-ids";
export type {
  ResolvedFieldId,
  FieldIdCollision,
  StepIdCollision,
} from "./duplicate-ids";

// Ref-swap: changing a field's registry ref to a similar type, migrating
// compatible overrides (issue #642).
export {
  SWAP_GROUPS,
  getSwappableRefs,
  migrateOverridesForRef,
} from "./ref-swap";
export type { SwapGroup, SwappableRef } from "./ref-swap";
