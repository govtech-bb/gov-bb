import {
  $generateJSONFromSelectedNodes,
  $generateNodesFromSerializedNodes,
  copyToClipboard,
} from "@lexical/clipboard";
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  mergeRegister,
  PASTE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $remapCopies } from "../../features/mentions/editor";
import { $blockGroup, $deepCopy, $depthAt, $headEnd, $rebase, $withNested } from "../nodes";
import { $isFolded, $restoreCopiedOptionValues, $selectedBlocks, $withGroups } from "./blocks";

// The system clipboard carries a marker; localStorage holds the blocks under an application-specific key.
export const clipboardMarker = "govbb://blocks";

export const clipboardKey = "govbb_blocks_clipboard";

/**
 * Copy selected groups with their settings and nested content. Paste after the caret’s group, or at the form’s end
 * during block selection. New IDs and remapped references keep pasted logic and mentions attached to their copies.
 */
export function blockClipboard(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(
      COPY_COMMAND,
      (event) => {
        const blocks = $withGroups($selectedBlocks());

        if (!blocks.length) return (localStorage.removeItem(clipboardKey), false);
        const selection = $createNodeSelection();

        for (const block of blocks) selection.add(block.getKey());
        localStorage.setItem(
          clipboardKey,
          JSON.stringify($generateJSONFromSelectedNodes(editor, selection).nodes),
        );
        // ⌘C over selected blocks comes as a keydown: Lexical's copy makes the clipboard event for it
        copyToClipboard(editor, event instanceof ClipboardEvent ? event : null, {
          "text/plain": clipboardMarker,
        });

        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (
          !editor.isEditable() ||
          !(event instanceof ClipboardEvent) ||
          event.clipboardData?.getData("text/plain") !== clipboardMarker
        )
          return false;
        event.preventDefault();
        // The parsed blocks keep the copied ids; their copies go in, with new ones. A clipboard we can't read pastes nothing
        let originals: LexicalNode[];

        try {
          originals = $generateNodesFromSerializedNodes(
            JSON.parse(localStorage.getItem(clipboardKey) ?? "[]"),
          );
        } catch {
          return true;
        }

        const pairs = originals.map((original): [LexicalNode, LexicalNode] => [
          original,
          $deepCopy(original),
        ]);

        const selection = $getSelection();

        const block = $isRangeSelection(selection)
          ? selection.anchor.getNode().getTopLevelElement()
          : null;

        let after = block
          ? $isFolded(block)
            ? $withNested($blockGroup(block)).at(-1)!
            : $headEnd(block)
          : $getRoot().getLastChild()!;

        const depth = $depthAt(after);

        for (const [, copy] of pairs) after = after.insertAfter(copy);
        $rebase(
          pairs.map(([, copy]) => copy),
          depth,
        );
        $restoreCopiedOptionValues(pairs);
        $remapCopies(pairs);
        const first = pairs.map(([, copy]) => copy).find($isElementNode);

        if (first) first.selectEnd();
        else $setSelection(null);

        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}
