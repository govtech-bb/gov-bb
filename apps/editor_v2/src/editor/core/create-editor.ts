import { registerEditorEditability } from "./editability";
import {
  createEditor,
  HISTORY_MERGE_TAG,
  mergeRegister,
  type SerializedEditorState,
} from "lexical";
import type { EditorDefinition } from "./definition";
import { registerEditorDefinition } from "./context";

export function createHeadlessEditor(
  definition: EditorDefinition,
  state?: SerializedEditorState,
  options: { prepare?: boolean; initialize?: () => void } = {},
) {
  const validated = state === undefined ? undefined : definition.validateDocument(state);

  const editor = createEditor({
    namespace: definition.namespace,
    nodes: [...new Set(definition.nodes.map((item) => item.node))],
    // Lexical adds class-name caches to its theme; keep them local to this editor.
    theme: structuredClone(definition.theme),
    onError: (error) => {
      throw error;
    },
  });

  const cleanup: (() => void)[] = [
    registerEditorDefinition(editor, definition),
    registerEditorEditability(editor),
  ];

  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mergeRegister(...cleanup)();
    editor.setRootElement(null);
  };

  try {
    for (const item of definition.registrations)
      if (item.phase === "document") cleanup.push(item.register(editor));

    if (validated)
      editor.setEditorState(editor.parseEditorState(validated), { tag: HISTORY_MERGE_TAG });

    if (options.prepare !== false)
      editor.update(
        () => {
          if (!validated) (options.initialize ?? definition.$initialize)?.();
          definition.$normalizeInitial();
        },
        { discrete: true, tag: HISTORY_MERGE_TAG },
      );

    return Object.assign(editor, { dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}
