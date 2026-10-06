import { fieldWidthOf as fieldWidth } from "../../src/forms/editor/preset-settings";
import { createEditor as createLexicalEditor, type EditorState, type LexicalEditor } from "lexical";
import { registerEditorDefinition } from "../../src/editor/core/context";
import { govbbFormEditor, govbbFormCodec, govbbFormRuntime } from "../../src/presets/govbb-form";
import { createFormSourceDialect } from "../../src/forms/source/dialect";
import { compileForm as compile } from "../../src/forms/editor/compile";
import { preflight as check } from "../../src/forms/adapters/ssb/validation";
import { legacyFieldAdapter } from "../../src/forms/editor/legacy-mappings";
import { initialDraft as initializeDraft } from "../../src/persistence/draft-store";
import { DraftStore as ConfiguredDraftStore } from "../../src/persistence/draft-store";
import { draftEditorConnection } from "../../src/host/draft-editor";
import type {
  DraftCodec,
  DraftKeys,
  DraftStorage,
  InitialDraft,
} from "../../src/persistence/types";
import type { FormRuntime } from "../../src/forms/editor/runtime";
import { govbbDraftKeys } from "../../src/host/govbb-draft";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import {
  rulesFor as rules,
  defaultMessage as message,
  messagesFor as messages,
} from "../../src/forms/editor/ssb";
import { fieldArrayKinds as repeatKinds } from "../../src/forms/features/repetition/queries";

/** Explicit preset fixture for tests written before editor composition existed. */
export function createEditor(options: Parameters<typeof createLexicalEditor>[0]) {
  const editor = createLexicalEditor(options);
  registerEditorDefinition(editor, govbbFormEditor);

  return editor;
}

const dialect = createFormSourceDialect(
  govbbFormEditor.fields.map((field) => field.source),
  govbbFormEditor.contents.map((content) => content.source),
);

export const {
  fromEditor,
  readMarkdown,
  writeMarkdown,
  toEditor,
  semanticFingerprint,
  questionKinds,
} = dialect;

export const draftCodec = govbbFormCodec;

export const prepareSource = govbbFormCodec.prepare;

export const compileForm = (state: EditorState, editor?: LexicalEditor) =>
  compile(state, govbbFormEditor, editor);

export const preflight = (schema: Parameters<typeof check>[0]) =>
  check(schema, {
    ...govbbFormEditor,
    fields: govbbFormEditor.fields.map((field) => ({
      ...field,
      legacySsb: legacyFieldAdapter(field),
    })),
  });

export * from "../../src/forms/core/references";

export * from "../../src/forms/adapters/ssb/schema";

export type { LegacySsbFormSchema as FormSchema } from "../../src/forms/adapters/ssb/schema";

export type * from "../../src/forms/core/logic";

export { $toMarkdown } from "../../src/forms/editor/compile";

export {
  MARKDOWN_KEY,
  PREVIOUS_MARKDOWN_KEY,
  WORKING_KEY,
  LEGACY_KEY,
} from "../../src/host/govbb-draft";

export { createDraftCodec } from "../../src/forms/editor/codec";

export * from "../../src/persistence/types";

export function initialDraft(
  storage: DraftStorage,
  create: () => void,
  codec: DraftCodec = govbbFormCodec,
  runtime: FormRuntime = govbbFormRuntime,
) {
  return initializeDraft(
    storage,
    () => runtime.prepare(undefined, create, "legacy"),
    codec,
    govbbDraftKeys,
  );
}

export class DraftStore extends ConfiguredDraftStore {
  constructor(
    storage: DraftStorage,
    initial: InitialDraft,
    codec: DraftCodec = govbbFormCodec,
    keys: DraftKeys = govbbDraftKeys,
  ) {
    super(storage, initial, codec, keys);
  }
  override connect(editor: LexicalEditor | Parameters<ConfiguredDraftStore["connect"]>[0]) {
    return super.connect("getEditorState" in editor ? draftEditorConnection(editor) : editor);
  }
}

function readDefault<T>(read: () => T) {
  const editor = createHeadlessEditor(govbbFormEditor, undefined, { prepare: false });

  try {
    return editor.read(read);
  } finally {
    editor.dispose();
  }
}

export const rulesFor = (...args: Parameters<typeof rules>) => readDefault(() => rules(...args));

export const defaultMessage = (...args: Parameters<typeof message>) =>
  readDefault(() => message(...args));

export const messagesFor = (...args: Parameters<typeof messages>) =>
  readDefault(() => messages(...args));

export const fieldArrayKinds = { has: (kind: string) => readDefault(() => repeatKinds.has(kind)) };

export { sourceSlug } from "../../src/forms/source/identifiers";

export const fieldWidthOf = (...args: Parameters<typeof fieldWidth>) =>
  readDefault(() => fieldWidth(...args));

export const formNodes = govbbFormEditor.nodes.map(({ node }) => node);
