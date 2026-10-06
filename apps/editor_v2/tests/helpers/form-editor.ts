import { type SerializedEditorState } from "lexical";
import { capabilityWarnings, logicIssues } from "../../src/forms/editor/capabilities";
import { compileForm, preflight } from "./default-form";
import { prepareSource } from "./default-form";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor as legacyFormDefinition } from "../../src/presets/govbb-form";

export function createFormEditor(state?: SerializedEditorState) {
  return createHeadlessEditor(legacyFormDefinition, state, { prepare: false });
}

export function inspectFormSource(source: string) {
  const prepared = prepareSource(source);
  const editor = createFormEditor(prepared.state);

  try {
    const state = editor.getEditorState();
    const schema = compileForm(state);

    return {
      source: prepared.source,
      // This is the existing SSB compatibility contract, not the future form schema.
      legacySsb: JSON.parse(
        JSON.stringify({
          schema,
          readiness: preflight(schema),
          logic: logicIssues(schema, state),
          compatibility: capabilityWarnings(schema, state),
        }),
      ),
    };
  } finally {
    editor.dispose();
  }
}

/** Migration creates fresh row IDs; only those declarations vary between identical runs. */
export function normalizeMigrationRowIds(source: string) {
  let condition = 0,
    action = 0;

  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

  return source.replace(
    /(:::logic[^\n]*\n```json\n)([\s\S]*?)(\n```\n:::)/g,
    (_, open: string, json: string, close: string) => {
      const settings = JSON.parse(json);

      const conditions = (rows: { id?: string; conditionals?: typeof rows }[]) =>
        rows.forEach((row) => {
          if (row.id && uuid.test(row.id)) row.id = `migration-condition-${++condition}`;

          if (row.conditionals) conditions(row.conditionals);
        });

      if (Array.isArray(settings.conditionals)) conditions(settings.conditionals);

      for (const row of settings.actions ?? [])
        if (typeof row.id === "string" && uuid.test(row.id))
          row.id = `migration-action-${++action}`;

      return open + JSON.stringify(settings, null, 2) + close;
    },
  );
}
