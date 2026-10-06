import type { DraftCodec, VisualPreparedSource } from "../../persistence/types";
import { SourceError } from "../../persistence/types";
import { lexicalToMarkdown } from "../../converters/lexicalToMarkdown";
import { markdownToLexical } from "../../converters/markdownToLexical";
import { formDefinition } from "../definition";
import type { FormRuntime } from "./runtime";

/** Persistence receives its codec explicitly from the host. */
export function createDraftCodec(runtime: FormRuntime): DraftCodec<VisualPreparedSource> {
  const definition = formDefinition(runtime.definition);

  return {
    prepare(source) {
      const parsed = markdownToLexical(source, definition);

      if (!parsed.state || parsed.diagnostics.some((issue) => issue.severity === "fatal"))
        throw new SourceError(
          "Correct the source errors before applying changes",
          parsed.diagnostics,
        );

      return {
        state: parsed.state,
        source: lexicalToMarkdown(parsed.state, definition),
        diagnostics: parsed.diagnostics,
        ...(parsed.migrated && { migrated: true, migrationOriginal: source }),
      };
    },
    encode: (state) => lexicalToMarkdown(state, definition),
    prepareLegacy: (value) => runtime.prepareLegacy(value),
  };
}
