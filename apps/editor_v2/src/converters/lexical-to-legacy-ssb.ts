import type { EditorState, LexicalEditor } from "lexical";
import type { FormEditorDefinition } from "../forms/definition";
import type { FieldIssue } from "../forms/model/fields";
import type { LegacySsbFormSchema } from "../forms/formats/legacy-ssb/projection/schema";
import { UnavailableSsbOutput } from "../forms/formats/legacy-ssb/projection/diagnostics";
import { compileForm } from "../forms/canvas/form-compile";
import { preflight } from "../forms/formats/legacy-ssb/projection/validation";
import { legacyFieldAdapter } from "../forms/formats/legacy-ssb/legacy-mappings";

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
