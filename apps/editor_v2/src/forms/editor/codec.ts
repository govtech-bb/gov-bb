import type { DraftCodec, VisualPreparedSource } from "../../persistence/types";
import { SourceError } from "../../persistence/types";
import { lexicalToFormMarkdown } from "../../converters/lexical-to-form-markdown";
import { formMarkdownToLexical } from "../../converters/form-markdown-to-lexical";
import { formDefinition } from "../definition";
import type { FormRuntime } from "./runtime";

/** Persistence receives its codec explicitly from the host. */
export function createFormDraftCodec(runtime: FormRuntime): DraftCodec<VisualPreparedSource> {
  const definition = formDefinition(runtime.definition);

  return {
    prepare(source) {
      const parsed = formMarkdownToLexical(source, definition);

      if (!parsed.state || parsed.diagnostics.some((issue) => issue.severity === "fatal"))
        throw new SourceError(
          "Correct the source errors before applying changes",
          parsed.diagnostics,
        );

      return {
        state: parsed.state,
        source: lexicalToFormMarkdown(parsed.state, definition),
        diagnostics: parsed.diagnostics,
        ...(parsed.migrated && { migrated: true, migrationOriginal: source }),
      };
    },
    encode: (state) => lexicalToFormMarkdown(state, definition),
    prepareLegacy: (value) => runtime.prepareLegacy(value),
  };
}
