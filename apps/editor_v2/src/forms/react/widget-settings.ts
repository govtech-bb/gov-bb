import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, type NodeKey } from "lexical";
import type { Settings } from "../../editor/core/settings";
import { $setFormSettings as $setSettings } from "../editor/native-settings";

export type WidgetProps = { nodeKey: NodeKey; settings: Settings };

/** Widget controls retain their own DOM focus while writing through the owning editor. */
export function useSetSettings(nodeKey: NodeKey) {
  const [editor] = useLexicalComposerContext();

  return (patch: Parameters<typeof $setSettings>[1], pushHistory = false) => {
    if (!editor.isEditable()) return;
    editor.update(
      () => {
        if (!editor.isEditable()) return;
        const node = $getNodeByKey(nodeKey);

        if (node) $setSettings(node, patch);
      },
      { tag: pushHistory ? [SKIP_DOM_SELECTION_TAG, HISTORY_PUSH_TAG] : SKIP_DOM_SELECTION_TAG },
    );
  };
}
