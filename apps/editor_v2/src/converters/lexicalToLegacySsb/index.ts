import type { EditorState, LexicalEditor } from "lexical";
import type { FormEditorDefinition } from "../../forms/definition";
import type { FieldIssue } from "../../forms/core/fields";
import type { LegacySsbFormSchema } from "../../forms/adapters/ssb/schema";
import { UnavailableSsbOutput } from "../../forms/adapters/ssb/diagnostics";
import { compileForm } from "../../forms/editor/compile";
import { preflight } from "../../forms/adapters/ssb/validation";
import { legacyFieldAdapter } from "../../forms/editor/legacy-mappings";

type LegacySsbProjection = { schema: LegacySsbFormSchema | null; diagnostics: FieldIssue[] };

/** Explicit compatibility projection for legacy SSB consumers. */
export function lexicalToLegacySsb(
  state: EditorState,
  definition: FormEditorDefinition,
  editor?: LexicalEditor,
): LegacySsbProjection {
  try {
    const schema = compileForm(state, definition, editor);

    const compatibility = {
      fields: definition.fields.map((field) => ({
        ...field,
        legacySsb: legacyFieldAdapter(field),
      })),
      logicActions: definition.logicActions,
    };

    return { schema, diagnostics: preflight(schema, compatibility) };
  } catch (error) {
    if (error instanceof UnavailableSsbOutput)
      return { schema: null, diagnostics: error.diagnostics };
    throw error;
  }
}
