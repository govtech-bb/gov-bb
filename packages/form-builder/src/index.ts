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
export { hydrateForm, collectUnknownRefs } from "./resolution";
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
