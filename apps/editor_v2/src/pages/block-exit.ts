import { $isQuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $findMatchingParent,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  HISTORY_MERGE_TAG,
  INSERT_PARAGRAPH_COMMAND,
  mergeRegister,
  RootNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $paragraphAfter } from "../editor/core/blocks";
import { PageComponentNode } from "./nodes";

/** The line of text after a block: an empty one already there, or a new one. */
function $lineAfter(block: LexicalNode) {
  const next = block.getNextSibling();

  return $isParagraphNode(next) && next.isEmpty() ? next : $paragraphAfter(block, false);
}

const $isButton = (node: LexicalNode) =>
  node instanceof PageComponentNode && (node.getKind() === "start" || node.getKind() === "action");

// The blocks that hold lines of text, which an empty last line leaves
const $holdsLines = (node: LexicalNode) =>
  $isQuoteNode(node) ||
  (node instanceof PageComponentNode &&
    (node.getKind() === "notice" || node.getKind() === "details"));

/**
 * Enter goes on writing below a block, as after a form's callout: in a button, or on the empty last line of a Notice,
 * Details or quote, it continues on a line of text after the block. A button's label stays whole.
 */
function $continueBelow() {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const node = selection.anchor.getNode();
  const button = $findMatchingParent(node, $isButton);

  if (button) {
    const group = button.getParent();

    // An action button goes on after its group of buttons
    $lineAfter(
      group instanceof PageComponentNode && group.getKind() === "actions" ? group : button,
    ).select();

    return true;
  }

  const holder = node.getParent();

  if (
    !$isElementNode(node) ||
    !node.isEmpty() ||
    node.getNextSibling() ||
    !holder ||
    !$holdsLines(holder)
  )
    return false;

  node.remove();
  $lineAfter(holder).select();

  if (holder.isEmpty()) holder.remove();

  return true;
}

/** The page ends on a paragraph, so there's always a line to write on after its last block. */
function $endOnText(root = $getRoot()) {
  if (!$isParagraphNode(root.getLastChild())) root.append($createParagraphNode());
}

/** Writing goes on below a page's blocks: Enter leaves a button, Notice, Details or quote, and the page ends on text. */
export function registerPageBlockExit(editor: LexicalEditor) {
  editor.update(() => $endOnText(), { tag: HISTORY_MERGE_TAG });

  return mergeRegister(
    editor.registerCommand(INSERT_PARAGRAPH_COMMAND, $continueBelow, COMMAND_PRIORITY_LOW),
    editor.registerNodeTransform(RootNode, $endOnText),
  );
}

/** A click below the last block writes there: at the end of the page's closing paragraph. */
export function $writeAtEnd() {
  $endOnText();
  $getRoot().selectEnd();
}
