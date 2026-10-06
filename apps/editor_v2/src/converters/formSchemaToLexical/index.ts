import type { SerializedEditorState } from "lexical";
import type { FormEditorDefinition } from "../../forms/definition";
import { createHeadlessEditor } from "../../editor/core/create-editor";
import { nativeFormToSerialized, NativeBindingError } from "../../forms/editor/native-bindings";
import { lexicalToFormSchema } from "../lexicalToFormSchema";
import {
  validateFormDefinition,
  nativeSemanticEqual,
  type NativeDiagnostic,
} from "../../forms/schema";

export type NativeImportResult =
  | { status: "ready"; state: SerializedEditorState; diagnostics: NativeDiagnostic[] }
  | {
      status: "blocked";
      state?: never;
      diagnostics: NativeDiagnostic[];
      recovery: { kind: "form-schema"; original: unknown };
    };

/** Validate and hydrate in isolation; reject any loss during configured preparation. */
export function formSchemaToLexical(
  value: unknown,
  definition: FormEditorDefinition,
): NativeImportResult {
  const blocked = (diagnostics: NativeDiagnostic[]): NativeImportResult => ({
    status: "blocked",
    diagnostics,
    recovery: { kind: "form-schema", original: value },
  });

  try {
    const validated = validateFormDefinition(value, definition.nativeCapabilities);

    if (validated.status === "blocked") return blocked(validated.diagnostics);
    const raw = definition.validateDocument(nativeFormToSerialized(validated.schema, definition));
    const editor = createHeadlessEditor(definition, raw);

    try {
      const exported = lexicalToFormSchema(editor.getEditorState(), definition, editor);

      if (exported.status === "blocked") return blocked(exported.diagnostics);

      if (!nativeSemanticEqual(validated.schema, exported.schema))
        return blocked([
          {
            code: "native-preservation",
            severity: "error",
            message: "This editor cannot preserve every property of this form",
            path: [],
          },
        ]);

      return {
        status: "ready",
        state: editor.getEditorState().toJSON(),
        diagnostics: [...validated.diagnostics, ...exported.diagnostics],
      };
    } finally {
      editor.dispose();
    }
  } catch (error) {
    if (error instanceof NativeBindingError) return blocked([error.diagnostic]);

    return blocked([
      {
        code: "native-import",
        severity: "error",
        path: [],
        message: error instanceof Error ? error.message : "This form could not be imported",
      },
    ]);
  }
}
