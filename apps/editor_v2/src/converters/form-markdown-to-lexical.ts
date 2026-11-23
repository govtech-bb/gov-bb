import type { SerializedEditorState } from "lexical";
import type { FormEditorDefinition } from "../forms/definition";
import { createFormSourceDialect } from "../forms/formats/markdown/dialect";
import { createFormRuntime } from "../forms/canvas/form-runtime";
import { syncNativeSource } from "../forms/formats/native/native-source";
import type { Diagnostic, FormDocument } from "../forms/formats/markdown/model";

type PreparedMarkdown = {
  state?: SerializedEditorState;
  document?: FormDocument;
  diagnostics: Diagnostic[];
  original: string;
  migrated?: boolean;
};

/** Prepare with the same installed document capabilities as the mounted editor. */
export function formMarkdownToLexical(
  source: string,
  definition: FormEditorDefinition,
): PreparedMarkdown {
  const dialect = createFormSourceDialect(
    definition.fields.map((field) => field.source),
    definition.contents.map((content) => content.source),
  );

  const parsed = dialect.readMarkdown(source);

  if (!parsed.document || parsed.diagnostics.some((issue) => issue.severity === "fatal"))
    return parsed;

  try {
    const runtime = createFormRuntime(definition);
    const raw = definition.validateDocument(dialect.toEditor(parsed.document));
    const hydrated = runtime.prepare(raw);

    if (
      dialect.semanticFingerprint(dialect.fromEditor(hydrated)) !==
      dialect.semanticFingerprint(parsed.document)
    )
      throw new Error("The editor cannot preserve every part of this source yet");
    const legacyMigrated = parsed.document.formatVersion === 1;

    const legacyState = syncNativeSource(
      legacyMigrated ? runtime.prepare(hydrated, undefined, "markdown") : hydrated,
      definition,
    );

    const native = runtime.prepareNative(legacyState);
    const state = native.migrated ? runtime.prepare(native.state) : legacyState;

    return {
      ...parsed,
      state,
      diagnostics: [
        ...parsed.diagnostics,
        ...native.diagnostics.map((issue) => ({
          code: issue.code,
          message: issue.message,
          severity: "warning" as const,
          line: 1,
          column: 1,
          sourceKey: issue.blockId,
        })),
      ],
      ...((legacyMigrated || native.migrated) && { migrated: true }),
    };
  } catch (error) {
    return {
      original: source,
      diagnostics: [
        {
          code: "source-load",
          severity: "fatal",
          message: error instanceof Error ? error.message : String(error),
          line: 1,
          column: 1,
        },
      ],
    };
  }
}
