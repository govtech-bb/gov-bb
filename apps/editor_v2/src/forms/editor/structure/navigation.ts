import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
  type ElementNode,
  type LexicalEditor,
} from "lexical";
import { $isFoldedAway } from "../nodes";
import { $atEdge, $caretBlock, $editableSibling, $isDrawnInput, $step } from "./editing";

/** Where the DOM caret is on screen. */
export function caretRect() {
  const selection = window.getSelection();

  return selection?.rangeCount ? selection.getRangeAt(0).getClientRects()[0] : undefined;
}

/** The DOM position under a point (Firefox has only caretPositionFromPoint, Safari only caretRangeFromPoint). */
export function domCaretAt(x: number, y: number): [Node, number] | null {
  const position = document.caretPositionFromPoint?.(x, y);

  if (position) return [position.offsetNode, position.offset];
  const range = document.caretRangeFromPoint?.(x, y);

  return range ? [range.startContainer, range.startOffset] : null;
}

/** Preserve the caret's x coordinate on the target's first or last line; points outside text fall back to its end. */
export function $selectAtX(
  editor: LexicalEditor,
  target: ElementNode,
  down: boolean,
  x: number | undefined,
) {
  if ($isDrawnInput(target)) return false;
  const dom = editor.getElementByKey(target.getKey());

  if (x === undefined || !dom) return false;
  const text = target.getDOMSlot(dom).element;
  const range = document.createRange();
  range.selectNodeContents(text);
  const lines = range.getClientRects();
  const line = down ? lines[0] : lines[lines.length - 1];

  if (!line) return false;
  const [domNode, domOffset] = domCaretAt(x, line.top + line.height / 2) ?? [];
  const node = domNode && text.contains(domNode) ? $getNearestNodeFromDOMNode(domNode) : null;

  if (!$isTextNode(node)) return (target.selectEnd(), true);
  const size = node.getTextContentSize();
  // A mention is one token: the caret goes to whichever side is nearer
  const offset = node.isToken() ? (domOffset! * 2 < size ? 0 : size) : Math.min(domOffset!, size);
  node.select(offset, offset);

  return true;
}

/** Whether the caret is on the block's first (up) or last (down) line, so the arrow would leave it. */
export function caretOnEdgeLine(editor: LexicalEditor, block: ElementNode, down: boolean) {
  if ($isDrawnInput(block)) return true;
  const dom = editor.getElementByKey(block.getKey());
  const caret = caretRect();

  if (!dom || !caret) return true; // an empty block has one line
  const text = block.getDOMSlot(dom).element;
  const box = text.getBoundingClientRect();
  const style = getComputedStyle(text);
  const half = (parseFloat(style.lineHeight) || 20) / 2;

  return down
    ? caret.bottom > box.bottom - parseFloat(style.paddingBottom) - half
    : caret.top < box.top + parseFloat(style.paddingTop) + half;
}

/**
 * Arrows and Tab skip widgets to the next text block; vertical arrows retain the caret's x coordinate.
 * Moving beyond the final block creates a text line. The browser handles ordinary text-to-text arrow movement.
 */
export function skipWidgets(editor: LexicalEditor) {
  const $move = (forward: boolean, event: KeyboardEvent, byLine: boolean, always = false) => {
    const caret = $caretBlock();

    if (!caret || event.shiftKey) return false;
    const { selection, block } = caret;

    if (!(byLine ? caretOnEdgeLine(editor, block, forward) : $atEdge(selection, block, !forward)))
      return false;
    const adjacent = $step(block, forward);

    if (
      !always &&
      !$isDrawnInput(block) &&
      !$isDrawnInput(adjacent) &&
      $isElementNode(adjacent) &&
      !$isFoldedAway(adjacent)
    )
      return false;
    const target = $editableSibling(block, forward);

    if (!target && !forward) return false;
    event.preventDefault();

    if (target) {
      if (byLine && $selectAtX(editor, target, forward, caretRect()?.left)) return true;

      if (forward) target.selectStart();
      else target.selectEnd();
    } else if (!($isParagraphNode(block) && block.isEmpty())) {
      const line = $createParagraphNode();
      $getRoot().append(line);
      line.selectStart();
    }

    return true;
  };

  return mergeRegister(
    editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => $move(true, event, true),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => $move(false, event, true),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => $move(true, event, false),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (event) => $move(false, event, false),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => $move(true, event, false, true),
      COMMAND_PRIORITY_LOW,
    ),
  );
}
