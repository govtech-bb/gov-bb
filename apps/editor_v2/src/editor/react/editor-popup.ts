import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isTableNode, $isTableSelection } from "@lexical/table";
import {
  $getNodeByKey,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  SKIP_SCROLL_INTO_VIEW_TAG,
  type BaseSelection,
  type PointType,
} from "lexical";
import { useCallback } from "react";
import { belowBar } from "../../ui/popover";

/**
 * Prefers space below the anchor, otherwise uses the roomier side.
 * Choose once on open to prevent flipping while the list is filtered.
 */
export function roomierSide(anchor: { top: number; bottom: number }, wanted = 320) {
  const below = window.innerHeight - anchor.bottom - 8;
  const above = anchor.top - belowBar().top;

  return below >= wanted || below >= above ? ("bottom" as const) : ("top" as const);
}

/** Whether a saved selection point still refers to an attached node and a valid offset. */
export function $validPoint(point: PointType) {
  const node = $getNodeByKey(point.key);

  return (
    !!node?.isAttached() &&
    point.offset >= 0 &&
    (point.type === "text"
      ? $isTextNode(node) && point.offset <= node.getTextContentSize()
      : $isElementNode(node) && point.offset <= node.getChildrenSize())
  );
}

function $stillThere(selection: BaseSelection) {
  if ($isTableSelection(selection)) return $isTableNode($getNodeByKey(selection.tableKey));

  return (
    $isRangeSelection(selection) && $validPoint(selection.anchor) && $validPoint(selection.focus)
  );
}

/**
 * Restores the saved selection on Escape or a second trigger press.
 * After an outside click, restores it only if no other control took focus.
 */
export function useCaretReturn() {
  const [editor] = useLexicalComposerContext();

  return useCallback(
    (selection: BaseSelection | null, reason: string) => {
      const now = reason === "escape-key" || reason === "trigger-press";

      const give = () => {
        const active = document.activeElement;

        if (!now && active && active !== document.body) return;
        editor.update(
          () => {
            if (selection && $stillThere(selection)) $setSelection(selection.clone());
          },
          { tag: SKIP_SCROLL_INTO_VIEW_TAG },
        );
        editor.focus();
      };

      if (now) give();
      // Wait for the outside click to finish moving focus.
      else setTimeout(give);
    },
    [editor],
  );
}
