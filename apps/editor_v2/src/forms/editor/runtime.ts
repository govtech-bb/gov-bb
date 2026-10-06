import { createFormSourceDialect } from "../source/dialect";
import { formDefinition } from "../definition";
import {
  $getRoot,
  type SerializedEditorState,
  type SerializedLexicalNode,
  type SerializedElementNode,
} from "lexical";
import { createHeadlessEditor } from "../../editor/core/create-editor";
import type { EditorDefinition } from "../../editor/core/definition";
import { $migrateLegacyConditions } from "../features/logic/migration";
import { $freezeRegistryOptions } from "./ssb";
import { prepareNativeBindings } from "./native-preparation";

export function createFormRuntime(definition: EditorDefinition) {
  const runtime = {
    definition,
    validate: definition.validateDocument,
    prepareNative: (state: SerializedEditorState) =>
      prepareNativeBindings(state, formDefinition(definition)),
    hydrate(state: SerializedEditorState) {
      const editor = createHeadlessEditor(definition, state, { prepare: false });

      try {
        return editor.getEditorState().toJSON();
      } finally {
        editor.dispose();
      }
    },
    prepare(state?: SerializedEditorState, create?: () => void, upgrade?: "legacy" | "markdown") {
      const editor = createHeadlessEditor(definition, state, { prepare: false });

      try {
        editor.update(
          () => {
            create?.();
            definition.$normalizeInitial();

            if (upgrade) {
              if (upgrade === "legacy") $freezeRegistryOptions();
              $migrateLegacyConditions();
            }

            for (const node of $getRoot().getChildren()) node.markDirty();
          },
          { discrete: true },
        );

        return definition.validateDocument(editor.getEditorState().toJSON());
      } finally {
        editor.dispose();
      }
    },
  };

  return {
    ...runtime,
    prepareLegacy(value: unknown) {
      const state = definition.validateDocument(value);
      const form = formDefinition(definition);

      const dialect = createFormSourceDialect(
        form.fields.map((field) => field.source),
        form.contents.map((content) => content.source),
      );

      const before = dialect.fromEditor(legacyValidationCopy(state));
      const parsed = runtime.hydrate(state);
      const after = dialect.fromEditor(legacyValidationCopy(parsed));

      if (dialect.semanticFingerprint(before) !== dialect.semanticFingerprint(after))
        throw new Error(
          "This saved draft contains properties the editor cannot preserve. Download the original draft to recover them.",
        );

      return runtime.prepare(state, undefined, "legacy");
    },
  };
}

export type FormRuntime = ReturnType<typeof createFormRuntime>;

/** Add missing page headings only to the validation copy, before legacy draft migration. */
function legacyValidationCopy(state: SerializedEditorState): SerializedEditorState {
  const copy = structuredClone(state);

  // SAFETY: validated editor nodes may have a widget tag and NodeState settings; property values remain unknown when inspecting legacy page roles.
  const nodes = copy.root.children as (SerializedLexicalNode &
    Partial<SerializedElementNode> & {
      widget?: unknown;
      $?: { settings?: Record<string, unknown> };
    })[];

  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;

    if (
      node.type !== "form-title" &&
      !(node.type === "widget" && (node.widget ?? "page-break") === "page-break")
    )
      continue;

    if (["check-answers", "declaration"].includes(String(node.$?.settings?.pageType))) continue;

    if (nodes[i + 1]?.type !== "page-title")
      nodes.splice(i + 1, 0, {
        type: "page-title",
        children: [],
        version: 1,
        format: "",
        indent: 0,
        direction: null,
      });
  }

  return copy;
}
