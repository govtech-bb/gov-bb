import type { SerializedEditorState } from "lexical";
import type { FormEditorDefinition } from "../../forms/definition";
import { createFormSourceDialect } from "../../forms/source/dialect";

export function lexicalToMarkdown(
  state: SerializedEditorState,
  definition: FormEditorDefinition,
): string {
  const snapshot = definition.validateDocument(state);

  const dialect = createFormSourceDialect(
    definition.fields.map((field) => field.source),
    definition.contents.map((content) => content.source),
  );

  const document = dialect.fromEditor(snapshot);
  const source = dialect.writeMarkdown(document);
  const parsed = dialect.readMarkdown(source);

  if (!parsed.document || parsed.diagnostics.some((issue) => issue.severity === "fatal"))
    throw new Error("The source could not be saved without losing content");

  if (dialect.semanticFingerprint(document) !== dialect.semanticFingerprint(parsed.document))
    throw new Error("The source could not be saved without changing the form");

  return source;
}
