import { fieldWidthOf as fieldWidth } from "../../src/forms/canvas/preset-settings";
import { createEditor as createLexicalEditor, type EditorState, type LexicalEditor } from "lexical";
import { registerEditorDefinition } from "../../src/editor/core/context";
import { govbbFormEditor, govbbFormCodec } from "../../src/presets/govbb-form";
import { createFormSourceDialect } from "../../src/forms/formats/markdown/dialect";
import { compileForm as compile } from "../../src/forms/canvas/form-compile";
import { preflight as check } from "../../src/forms/formats/legacy-ssb/projection/validation";
import { legacyFieldAdapter } from "../../src/forms/formats/legacy-ssb/legacy-mappings";
import { initialDraft as initializeDraft } from "../../src/persistence/draft-store";
import { DraftStore as ConfiguredDraftStore } from "../../src/persistence/draft-store";
import { draftEditorConnection } from "../../src/host/draft-editor";
import type { DraftCodec } from "../../src/persistence/types";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import {
  rulesFor as rules,
  defaultMessage as message,
  messagesFor as messages,
} from "../../src/forms/formats/legacy-ssb/legacy-ssb-rules";
import { fieldArrayKinds as repeatKinds } from "../../src/forms/repetition/repetition-queries";

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

export * from "../../src/forms/model/references";

export * from "../../src/forms/formats/legacy-ssb/projection/schema";

export type { LegacySsbFormSchema as FormSchema } from "../../src/forms/formats/legacy-ssb/projection/schema";

export type * from "../../src/forms/model/logic";

export { $toMarkdown } from "../../src/forms/canvas/form-compile";

export { createFormDraftCodec } from "../../src/forms/canvas/form-codec";

export * from "../../src/persistence/types";

export function initialDraft(source: string, codec: DraftCodec = govbbFormCodec) {
  return initializeDraft(source, codec);
}

export class DraftStore extends ConfiguredDraftStore {
  constructor(source: string, codec: DraftCodec = govbbFormCodec) {
    super(source, codec);
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

export { sourceSlug } from "../../src/forms/formats/markdown/identifiers";

export const fieldWidthOf = (...args: Parameters<typeof fieldWidth>) =>
  readDefault(() => fieldWidth(...args));

export const formNodes = govbbFormEditor.nodes.map(({ node }) => node);
