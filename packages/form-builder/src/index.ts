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

// Builtins
export { BUILTIN_COMPONENTS, BUILTIN_BLOCKS } from "./builtins/index";

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
