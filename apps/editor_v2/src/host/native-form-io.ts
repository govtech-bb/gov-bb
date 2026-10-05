import type { LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../editor/core/create-editor";
import type { FormEditorDefinition } from "../forms/definition";
import { formSchemaToLexical } from "../converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../converters/lexicalToFormSchema";
import { nativeSemanticEqual, type NativeDiagnostic } from "../forms/schema";
import type { DraftStore } from "../persistence/draft-store";
import type {
  DraftCodec,
  DraftReplacementToken,
  VisualPreparedSource,
  ReplacementResult,
} from "../persistence/types";

export type PendingNativeImport = {
  kind: "form-schema-import";
  version: 1;
  source: string;
  diagnostics: NativeDiagnostic[];
  status: "ready" | "blocked";
  prepared?: VisualPreparedSource;
  summary?: { title: string; pages: number; questions: number };
};

const issue = (message: string, code = "native-import"): NativeDiagnostic => ({
  code,
  severity: "error",
  message,
  path: [],
});

/** Preparation owns no live editor or storage; exact uploaded bytes survive every failure. */
export function prepareNativeImport(
  source: string,
  definition: FormEditorDefinition,
  codec: DraftCodec<VisualPreparedSource>,
): PendingNativeImport {
  const original: PendingNativeImport = {
    kind: "form-schema-import",
    version: 1,
    source,
    diagnostics: [],
    status: "blocked",
  };

  let value: unknown;

  try {
    value = JSON.parse(source);
  } catch {
    return { ...original, diagnostics: [issue("This file is not valid JSON", "invalid-json")] };
  }

  try {
    const imported = formSchemaToLexical(value, definition);

    if (imported.status === "blocked") return { ...original, diagnostics: imported.diagnostics };
    const source = codec.encode(imported.state);
    const prepared = codec.prepare(source);
    const editor = createHeadlessEditor(definition, prepared.state);

    try {
      const result = lexicalToFormSchema(editor.getEditorState(), definition, editor);

      if (result.status === "blocked") return { ...original, diagnostics: result.diagnostics };

      if (!nativeSemanticEqual(value, result.schema))
        return {
          ...original,
          diagnostics: [
            issue(
              "Markdown draft storage cannot preserve every property of this form",
              "native-storage-preservation",
            ),
          ],
        };

      return {
        ...original,
        status: "ready",
        prepared,
        diagnostics: imported.diagnostics,
        summary: {
          title: result.schema.title,
          pages: result.schema.blocks.filter((block) => block.type === "page").length,
          questions: result.schema.blocks.filter((block) => block.type === "question").length,
        },
      };
    } finally {
      editor.dispose();
    }
  } catch (error) {
    return {
      ...original,
      diagnostics: [issue(error instanceof Error ? error.message : String(error))],
    };
  }
}

export function nativeIOUnavailable(store: DraftStore, editor: LexicalEditor): string | undefined {
  const draft = store.getSnapshot();

  if (draft.replacement || draft.recovery)
    return "Recover the draft before importing or exporting JSON";

  if (draft.conflict) return "Resolve the draft conflict before importing or exporting JSON";

  if (draft.dirty)
    return "Apply or discard your Markdown changes before importing or exporting JSON";

  if (!draft.valid || !editor.isEditable()) return "This form is currently read only";

  if (draft.status !== "saved") return "Save the current draft before importing or exporting JSON";
}

/** Capture before asynchronous file reading; later intervening edits invalidate this token. */
export function beginNativeImport(
  store: DraftStore,
  editor: LexicalEditor,
): { token?: DraftReplacementToken; error?: string } {
  store.flush();
  const error = nativeIOUnavailable(store, editor);

  return error ? { error } : { token: store.captureReplacementToken() };
}

export function applyNativeImport(
  pending: PendingNativeImport,
  token: DraftReplacementToken,
  store: DraftStore,
  editor: LexicalEditor,
): ReplacementResult {
  const unavailable = nativeIOUnavailable(store, editor);

  if (unavailable) return { status: "rejected", message: unavailable };

  if (pending.status !== "ready" || !pending.prepared)
    return {
      status: "rejected",
      message: "Correct the JSON import errors before applying this form",
    };

  return store.replacePrepared(pending.prepared, token, {
    original: pending.source,
    canCommit: () => editor.isEditable(),
  });
}

export function exportNativeForm(
  store: DraftStore,
  editor: LexicalEditor,
  definition: FormEditorDefinition,
) {
  store.flush();
  const unavailable = nativeIOUnavailable(store, editor);

  if (unavailable) return { diagnostics: [issue(unavailable, "draft-unavailable")] };
  const result = lexicalToFormSchema(editor.getEditorState(), definition, editor);

  return result.status === "ready"
    ? { source: JSON.stringify(result.schema, null, 2) + "\n", diagnostics: result.diagnostics }
    : { diagnostics: result.diagnostics };
}
