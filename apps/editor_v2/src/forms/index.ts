export { defineFormEditor, formDefinition, type FormEditorDefinition } from "./definition";

export { defineField, type FieldDefinition, type ResolvedField, type FormModule } from "./field";

export { defineSetting, ruleLimit, type QuestionSetting } from "./settings/define-setting";

export { configSetting } from "./settings/shared-settings";

export { defineContent, type ContentDefinition } from "./content/define-content";

export type { Settings, Setting } from "./model/settings";

export type {
  FieldIssue,
  FieldCapabilities,
  FieldReference,
  ReferenceVisitor,
} from "./model/fields";

export type {
  Condition as LegacyCondition,
  Action as LegacyAction,
  LogicalOperator as LegacyLogicalOperator,
} from "./model/logic";

export type {
  FormDefinitionV2,
  AnyFormDefinition,
  AnyFormBlock,
  QuestionBlock,
  QuestionBase,
  ContentBlock,
  ContentBase,
  PageBlock,
  PageRole,
  LogicBlock,
  CalculatedBlock,
  Condition,
  LogicAction,
  Expression,
  RichText,
  QuestionOption,
  NativeQuestion,
  NativeContent,
  NativeDiagnostic,
} from "./formats/native/schema";

export {
  validateFormDefinition,
  nativeSemanticEqual,
  nativeDiagnosticPath,
} from "./formats/native/schema";

export type {
  SourceBlock,
  SourceQuestion,
  SourceContent,
  SourceOption,
  NodeState,
  FormDocument,
  Diagnostic,
} from "./formats/markdown/model";

export type { FieldSourceHandler, RawFieldNode } from "./formats/markdown/field";

export type { ContentSourceHandler } from "./formats/markdown/content";

export { fieldModule, type FieldInsertion, type FieldPreviewProps } from "./canvas/field-module";

export { formContentModule } from "./content/form-content-module";

export {
  $createDrawnInput,
  $createDecoratorField,
  $createFieldLabel,
  $createLongAnswerInput,
  $createChoiceInput,
} from "./canvas/field-nodes";

export { InputNode, OptionNode, WidgetNode, LongAnswerNode } from "./canvas/answer-nodes";

export { $createFormTitleNode, $createPageTitleNode } from "./canvas/form-nodes";

export { FormEditor, FormName } from "./canvas/form-editor";

export type { BlockMenuModel, BlockMenuActions } from "./canvas/block-settings";

export { useSetSettings, type WidgetProps } from "./canvas/widget-settings";

export { useStore, Field, Label, Value, Toggle, Switch } from "./canvas/settings-controls";

export {
  defineFormRegistry,
  defineFormRegistryEntry,
  type FormRegistry,
  type FormRegistryEntry,
  type FormRegistryFragment,
  type FormRegistryForm,
} from "./form-registry/definition";

export { question, option, content, group, rule } from "./form-registry/builders";

export { FormRegistryModule, $registryBlocks } from "./canvas/form-registry-module";

export {
  prepareRegistryEntry,
  $instantiateRegistryEntry,
  createRegistryForm,
  type PreparedRegistryFragment,
} from "./canvas/form-registry-insertion";

export { createFormRuntime, type FormRuntime } from "./canvas/form-runtime";

export { createFormDraftCodec } from "./canvas/form-codec";

export { lexicalToFormMarkdown } from "../converters/lexical-to-form-markdown";

export { formMarkdownToLexical } from "../converters/form-markdown-to-lexical";

export { lexicalToLegacySsb } from "../converters/lexical-to-legacy-ssb";

export type { LegacySsbFormSchema } from "./formats/legacy-ssb/projection/schema";

export { lexicalToFormSchema } from "../converters/lexical-to-form-schema";

export { formSchemaToLexical, type NativeImportResult } from "../converters/form-schema-to-lexical";

export {
  nativeField,
  nativeContent,
  defineNativeField,
  defineNativeContent,
  resolveNativeField,
  resolveNativeContent,
} from "./native";

export type {
  NativeFieldHandler,
  NativeContentHandler,
  NativeFieldImportContext,
  NativeFieldExportContext,
  NativeContentImportContext,
  NativeContentExportContext,
} from "./native";
