// ===== CI STRESS TEST — DELETE THIS BLOCK =====
const _ft1: number = "wrong";
const _ft2: string = false;
const _ft3: boolean[] = "not array";
const _ft4: { key: string } = { key: 123 };
const _ft5: number = { nested: true };
// ===== END CI STRESS TEST =====

export {
  primitiveMetadataSchema,
  htmlTypesSchema,
  optionSchema,
  basePrimitiveSchema,
  textPrimitiveSchema,
  textAreaPrimitiveSchema,
  datePrimitiveSchema,
  numberPrimitiveSchema,
  telPrimitiveSchema,
  emailPrimitiveSchema,
  checkboxPrimitiveSchema,
  selectPrimitiveSchema,
  radioPrimitiveSchema,
  filePrimitiveSchema,
  primitiveSchema,
  fieldOverridesSchema,
  primitiveUISchema,
} from "./primitive.type";

export type {
  PrimitiveMetadata,
  BasePrimitive,
  FieldOverrides,
  Option,
  SelectPrimitive,
  RadioPrimitive,
  FilePrimitive,
  TextPrimitive,
  TextAreaPrimitive,
  DatePrimitive,
  NumberPrimitive,
  TelPrimitive,
  EmailPrimitive,
  CheckboxPrimitive,
  Primitive,
  HtmlTypes,
  PrimitiveUI,
} from "./primitive.type";

export {
  validationConfigSchema,
  validationTypeSchema,
  validationRuleSchema,
} from "./validation.type";

export type {
  ValidationConfig,
  ValidationType,
  ValidationRule,
} from "./validation.type";

export {
  fieldConditionalOnBehaviourSchema,
  stepConditionalOnBehaviourSchema,
  repeatableBehaviourSchema,
  fieldArrayBehaviourSchema,
  sharedFieldsBehaviourSchema,
  behaviourSchema,
  equalityOperationsSchema,
} from "./behavior.type";

export type {
  Behaviour,
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
  RepeatableBehaviour,
  FieldArrayBehaviour,
  SharedFieldsBehaviour,
  EqualityOperations,
} from "./behavior.type";

export type { Block } from "./block.type";

export {
  formStepSchema,
  recipeComponentFieldSchema,
  recipeBlockFieldSchema,
  recipeFormStepFieldSchema,
  recipeFormStepSchema,
} from "./form-step.type";

export type {
  FormStep,
  RecipeFormStep,
  RecipeFormStepField,
  RecipeComponentField,
  RecipeBlockField,
} from "./form-step.type";

export { processorSchema } from "./processor.type";

export type { Processor } from "./processor.type";

export {
  dateTimeFormatSchema,
  serviceContractSchema,
  serviceContractRecipeSchema,
} from "./service-contract.type";

export type {
  ServiceContract,
  ServiceContractRecipe,
  DateTimeFormat,
} from "./service-contract.type";
