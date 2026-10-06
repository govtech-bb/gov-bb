import type { SerializedLexicalNode } from "lexical";
import type { FormEditorDefinition } from "./definition";
import type {
  CalculatedBlock,
  ContentBase,
  LogicBlock,
  NativeContent,
  NativeContentCapability,
  NativeDiagnostic,
  NativeFieldCapability,
  NativePath,
  NativeQuestion,
  NativeScalar,
  NativeReference,
  NativeValueType,
  QuestionBase,
  Condition,
  DisplayFormat,
  Expression,
  LogicAction,
  PageRole,
} from "./schema";

export type NativeContentBlock = ContentBase | LogicBlock | CalculatedBlock;

export type NativeFeatureContributions = {
  readonly pageRoles?: readonly PageRole[];
  readonly actions?: readonly LogicAction["type"][];
  readonly operators?: readonly (
    | Extract<Expression, { op: string }>["op"]
    | Exclude<Condition, boolean>["op"]
  )[];
  readonly formats?: readonly DisplayFormat["type"][];
};

export type NativeFieldImportContext = {
  importQuestion(block: QuestionBase, fieldKind: string): SerializedLexicalNode[];
};

export type NativeFieldExportContext = {
  readonly nodes: readonly SerializedLexicalNode[];
  exportQuestion(fieldKind: string): QuestionBase;
};

export type NativeContentImportContext = {
  importContent(block: NativeContentBlock, contentKind: string): SerializedLexicalNode[];
};

export type NativeContentExportContext = {
  readonly nodes: readonly SerializedLexicalNode[];
  exportContent(contentKind: string): NativeContentBlock;
};

/** Extension configuration references are declared structurally, never found by string replacement. */
export type NativeModuleReference = NativeReference;

export type NativeModuleReferenceVisitor = (reference: NativeModuleReference) => string;

export type NativeFieldHandler = Omit<NativeFieldCapability, "references"> & {
  references?: (block: QuestionBase, visit: NativeModuleReferenceVisitor) => QuestionBase;
  import(block: QuestionBase, context: NativeFieldImportContext): SerializedLexicalNode[];
  export(context: NativeFieldExportContext): QuestionBase;
};

export type NativeContentHandler = Omit<NativeContentCapability, "references"> & {
  blockType: NativeContentBlock["type"];
  references?: (
    block: NativeContentBlock,
    visit: NativeModuleReferenceVisitor,
  ) => NativeContentBlock;
  import(block: NativeContentBlock, context: NativeContentImportContext): SerializedLexicalNode[];
  export(context: NativeContentExportContext): NativeContentBlock;
};

export type NativeFieldDeclaration<K extends string, C extends object> = {
  kind: K;
  config?: Readonly<Partial<{ [P in keyof C]: Extract<C[P], NativeScalar> }>>;
  valueType: NativeValueType;
  validate?: (block: NativeQuestion<K, C>, path: NativePath) => readonly NativeDiagnostic[];
  references?: (
    block: NativeQuestion<K, C>,
    visit: NativeModuleReferenceVisitor,
  ) => NativeQuestion<K, C>;
  import(block: NativeQuestion<K, C>, context: NativeFieldImportContext): SerializedLexicalNode[];
  export(context: NativeFieldExportContext): NativeQuestion<K, C>;
};

export type NativeContentDeclaration<K extends string, C extends object> = {
  kind: K;
  config?: Readonly<Partial<{ [P in keyof C]: Extract<C[P], NativeScalar> }>>;
  validate?: (block: NativeContent<K, C>, path: NativePath) => readonly NativeDiagnostic[];
  references?: (
    block: NativeContent<K, C>,
    visit: NativeModuleReferenceVisitor,
  ) => NativeContent<K, C>;
  import(block: NativeContent<K, C>, context: NativeContentImportContext): SerializedLexicalNode[];
  export(context: NativeContentExportContext): NativeContent<K, C>;
};

/** Public callbacks remain typed; only the configured dispatch table erases the module's configuration. */
export function defineNativeField<K extends string, C extends object>(
  handler: NativeFieldDeclaration<K, C>,
): NativeFieldHandler {
  // SAFETY: configured dispatch checks this handler’s kind/config before calling the unchanged callbacks.
  return freezeHandler(handler) as NativeFieldHandler;
}

export function defineNativeContent<K extends string, C extends object>(
  handler: NativeContentDeclaration<K, C>,
): NativeContentHandler {
  // SAFETY: configured content dispatch checks kind/config; this only erases the callback’s generic parameters.
  return freezeHandler({
    ...handler,
    blockType: "content" as const,
  }) as NativeContentHandler;
}

function freezeHandler<T extends { config?: object }>(handler: T): T {
  const copy = { ...handler };

  if (copy.config) copy.config = Object.freeze({ ...copy.config });

  return Object.freeze(copy);
}

/** Built-ins share serialized structure conversion while retaining configured storage ownership. */
export function nativeField(
  editorKind: string,
  capability: Omit<NativeFieldCapability, "references"> & Pick<NativeFieldHandler, "references">,
): NativeFieldHandler {
  return freezeHandler({
    ...capability,
    import: (block: QuestionBase, context: NativeFieldImportContext) =>
      context.importQuestion(block, editorKind),
    export: (context: NativeFieldExportContext) => context.exportQuestion(editorKind),
  });
}

export function nativeContent(
  editorKind: string,
  capability: Omit<NativeContentCapability, "references"> &
    Pick<NativeContentHandler, "references"> & { blockType?: NativeContentBlock["type"] },
): NativeContentHandler {
  return freezeHandler({
    ...capability,
    blockType: capability.blockType ?? "content",
    import: (block: NativeContentBlock, context: NativeContentImportContext) =>
      context.importContent(block, editorKind),
    export: (context: NativeContentExportContext) => context.exportContent(editorKind),
  });
}

function effectiveConfig(block: { kind: string; config?: unknown }): Record<string, unknown> {
  const config: Record<string, unknown> =
    block.config && typeof block.config === "object" && !Array.isArray(block.config)
      ? { ...block.config }
      : {};

  if (block.kind === "choice" && config.presentation === undefined) {
    if (config.selection === "single") config.presentation = "radio";

    if (config.selection === "multiple") config.presentation = "checkboxes";
  }

  if (block.kind === "callout" && config.tone === undefined) config.tone = "inset";

  if (block.kind === "list" && config.ordered === undefined) config.ordered = false;

  return config;
}

function matches(
  capability: { kind: string; config?: Readonly<Record<string, NativeScalar>> },
  block: { kind: string; config?: unknown },
) {
  if (capability.kind !== block.kind) return false;
  const config = effectiveConfig(block);

  return Object.entries(capability.config ?? {}).every(([key, value]) => config[key] === value);
}

export function resolveNativeField(block: QuestionBase, definition: FormEditorDefinition) {
  return definition.nativeFields.find((field) => matches(field.native!, block));
}

export function resolveNativeContent(block: NativeContentBlock, definition: FormEditorDefinition) {
  return definition.nativeContents.find(
    (content) =>
      content.native!.blockType === block.type &&
      (block.type === "content"
        ? matches(content.native!, block)
        : content.native!.kind === block.type),
  );
}
