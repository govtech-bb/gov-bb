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

// What the popups over the text share: the side they open on, and the caret they hand back when they close without
// acting.

/**
 * Below its anchor when a list has room there, or else on the side with more room. Picked once as it opens, so a
 * popup that filters as you type shrinks towards its anchor instead of flipping over it.
 */
export function roomierSide(anchor: { top: number; bottom: number }, wanted = 320) {
  const below = window.innerHeight - anchor.bottom - 8;
  const above = anchor.top - belowBar().top;

  return below >= wanted || below >= above ? ("bottom" as const) : ("top" as const);
}

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
 * Hands the caret back when a popup over the text closes without acting: on Esc, a second press of its own button,
 * or a press on nothing in particular, the caret goes back where it was, without scrolling. A press on another
 * control, or in the text, keeps the focus it took. Without this, focus fell to the page's top, and the next
 * keystrokes landed in its first heading.
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
      // A press outside moves the focus as it ends, so look where it went once it has
      else setTimeout(give);
    },
    [editor],
  );
}
