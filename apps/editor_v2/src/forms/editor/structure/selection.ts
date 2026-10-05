import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $isElementNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  mergeRegister,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $headEnd, $headStart, $isFormTitleNode, $pageHead } from "../nodes";
import { $moveBlocks, $next, $removeBlocks, $selectedBlocks, $selectNodes } from "./blocks";
import { $caretBlock, $isDrawnInput } from "./editing";
import { composing } from "./keyboard";
import { blockSelectionState, clearBlockSelectionState } from "./selection-state";

/** The block a DOM node is in: its nearest node's top-level element. */
export const $blockAtDOM = (dom: Node) =>
  $getNearestNodeFromDOMNode(dom)?.getTopLevelElement() ?? null;

/**
 * Escape selects the caret's block; Enter resumes editing or inserts text after a widget.
 * Arrow navigation skips folded content. Shift+arrows toggle beyond the last toggle, so reversing leaves holes.
 * Command+Shift+arrows move selected groups across whole folded questions and pages.
 */
export function selectBlocks(editor: LexicalEditor) {
  const selectionState = blockSelectionState(editor);
  let marked: HTMLElement[] = [];

  // Avoid scrolling blocks that are already fully visible.
  const reveal = (node: LexicalNode) => {
    const el = editor.getElementByKey(node.getKey());
    const r = el?.getBoundingClientRect();

    if (r && !(r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth))
      el!.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const $beyond = (from: LexicalNode, down: boolean) => {
    const next = $next(down ? $headEnd(from) : from, down);

    return next && $headStart(next);
  };

  const $toggle = (blocks: LexicalNode[], down: boolean) => {
    const edge = down ? blocks.at(-1)! : blocks[0]!;
    const last = selectionState.toggled === null ? null : $getNodeByKey(selectionState.toggled);

    const next = $beyond(
      last && (down ? last.isBefore(edge) : edge.isBefore(last)) ? last : edge,
      down,
    );

    if (!next || $isFormTitleNode(next)) return;
    const keys = new Set(blocks.map((block) => block.getKey()));

    if (!keys.delete(next.getKey())) keys.add(next.getKey());
    $selectNodes([...keys].flatMap((key) => $getNodeByKey(key) ?? []));
    selectionState.toggled = next.getKey();
    reveal(next);
  };

  const $arrow = (down: boolean, event: KeyboardEvent) => {
    const blocks = $selectedBlocks();

    if (!blocks.length) return false;
    event.preventDefault();

    if ((event.metaKey || event.ctrlKey) && event.shiftKey) $moveBlocks(blocks, down);
    else if (event.shiftKey) $toggle(blocks, down);
    else {
      const next = $beyond(down ? blocks.at(-1)! : blocks[0]!, down);

      if (next && !$isFormTitleNode(next)) {
        $selectNodes([next]);
        selectionState.toggled = null;
        reveal(next);
      }
    }

    return true;
  };

  const $remove = (event: KeyboardEvent) => {
    const blocks = $selectedBlocks();

    if (!blocks.length) return false;
    event.preventDefault();
    $removeBlocks(blocks);
    $setSelection(null);

    return true;
  };

  return mergeRegister(
    () => clearBlockSelectionState(editor),
    editor.registerUpdateListener(({ editorState }) => {
      for (const el of marked) el.removeAttribute("data-selected");
      marked = editorState.read(
        () =>
          $selectedBlocks()
            .flatMap((node) => [node, ...$pageHead(node)])
            .flatMap((node) => editor.getElementByKey(node.getKey()) ?? []),
        { editor },
      );

      for (const el of marked) el.setAttribute("data-selected", "");

      if (!marked.length) selectionState.toggled = null;
    }),
    editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if ($selectedBlocks().length) return ($setSelection(null), true);
        const block = $caretBlock()?.block;
        const target = block && $headStart(block);

        if (!target || $isFormTitleNode(target)) return false;
        $selectNodes([target]);

        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => $arrow(true, event),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => $arrow(false, event),
      COMMAND_PRIORITY_LOW,
    ),
    // ⌘⇧↑/↓ come as plain keydowns: Lexical sends no arrow command with ⌘ or Ctrl held
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) =>
        !composing(event) &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        $arrow(event.key === "ArrowDown", event),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(KEY_BACKSPACE_COMMAND, $remove, COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_DELETE_COMMAND, $remove, COMMAND_PRIORITY_LOW),
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const [node] = $selectedBlocks();

        if (!node) return false;
        event?.preventDefault();

        if ($isElementNode(node) && !$isDrawnInput(node)) return (node.selectEnd(), true);
        const line = $createParagraphNode();
        node.insertAfter(line);
        line.selectStart();

        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}
