import type { EditorState, LexicalEditor } from "lexical";
import type { FormEditorDefinition } from "../../forms/definition";
import { readFormState } from "../../forms/editor/context";
import { NativeBindingError, serializedToNativeForm } from "../../forms/editor/native-bindings";
import {
  validateFormDefinition,
  type NativeValidationResult,
  type NativeDiagnostic,
} from "../../forms/schema";

/** Export reads the owning editor without normalizing or allocating identities. */
export function lexicalToFormSchema(
  state: EditorState,
  definition: FormEditorDefinition,
  editor?: LexicalEditor,
): NativeValidationResult {
  try {
    return readFormState(
      state,
      definition,
      () => {
        const diagnostics: NativeDiagnostic[] = [];
        const schema = serializedToNativeForm(state.toJSON(), definition, diagnostics);
        const validated = validateFormDefinition(schema, definition.nativeCapabilities);

        return diagnostics.length
          ? {
              status: "blocked",
              schema: null,
              diagnostics: [...diagnostics, ...validated.diagnostics],
            }
          : validated;
      },
      editor,
    );
  } catch (error) {
    if (error instanceof NativeBindingError)
      return { status: "blocked", schema: null, diagnostics: [error.diagnostic] };
    throw error;
  }
}
