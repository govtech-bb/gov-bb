export { defineFormEditor, formDefinition, type FormEditorDefinition } from "./definition";

export { defineField, type FieldDefinition, type ResolvedField, type FormModule } from "./field";

export { defineContent, type ContentDefinition } from "./content";

export type { Settings, Setting } from "./core/settings";

export type {
  FieldIssue,
  FieldCapabilities,
  FieldReference,
  ReferenceVisitor,
} from "./core/fields";

export type {
  Condition as LegacyCondition,
  Action as LegacyAction,
  LogicalOperator as LegacyLogicalOperator,
} from "./core/logic";

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
} from "./schema";

export { validateFormDefinition, nativeSemanticEqual, nativeDiagnosticPath } from "./schema";

export type {
  SourceBlock,
  SourceQuestion,
  SourceContent,
  SourceOption,
  NodeState,
  FormDocument,
  Diagnostic,
} from "./source/model";

export type { FieldSourceHandler, RawFieldNode } from "./source/field";

export type { ContentSourceHandler } from "./source/content";

export { fieldModule, type FieldInsertion, type FieldPreviewProps } from "./editor/field-module";

export { formContentModule } from "./editor/content-module";

export {
  $createDrawnInput,
  $createDecoratorField,
  $createFieldLabel,
  $createLongAnswerInput,
  $createChoiceInput,
} from "./editor/field-nodes";

export { InputNode, OptionNode, WidgetNode, LongAnswerNode } from "./editor/answer-nodes";

export { $createFormTitleNode, $createPageTitleNode } from "./editor/nodes";

export { FormEditor, FormName } from "./react/form-editor";

export type { BlockMenuModel, BlockMenuActions } from "./react/block-settings";

export { useSetSettings, type WidgetProps } from "./react/widget-settings";

export { useStore, Field, Label, Value, Toggle, Switch } from "./react/settings-controls";

export {
  defineFormRegistry,
  defineFormRegistryEntry,
  type FormRegistry,
  type FormRegistryEntry,
  type FormRegistryFragment,
  type FormRegistryForm,
} from "./registry/definition";

export { question, option, content, group, rule } from "./registry/builders";

export { FormRegistryModule, $registryBlocks } from "./editor/registry-module";

export {
  prepareRegistryEntry,
  $instantiateRegistryEntry,
  createRegistryForm,
  type PreparedRegistryFragment,
} from "./editor/registry";

export { createFormRuntime, type FormRuntime } from "./editor/runtime";

export { createDraftCodec } from "./editor/codec";

export { lexicalToMarkdown } from "../converters/lexicalToMarkdown";

export { markdownToLexical } from "../converters/markdownToLexical";

export { lexicalToLegacySsb } from "../converters/lexicalToLegacySsb";

export type { LegacySsbFormSchema } from "./adapters/ssb/schema";

export { lexicalToFormSchema } from "../converters/lexicalToFormSchema";

export { formSchemaToLexical, type NativeImportResult } from "../converters/formSchemaToLexical";

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
