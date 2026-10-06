import {
  $createParagraphNode,
  $createRangeSelectionFromDom,
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $getState,
  $isElementNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_DOWN_COMMAND,
  mergeRegister,
  PASTE_COMMAND,
  RootNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import { $deleteAtHead, $enterInHead } from "../../features/pages/headings";
import { $exitCallout } from "../../../editor/modules/callouts/editing";
import { $exitDisclosure, $pasteDisclosure } from "../../../editor/modules/disclosure/editing";
import { $enterHeading } from "../../../editor/modules/headings/editing";
import { $enterList, $exitList } from "../../../editor/modules/lists/editing";
import { $moveOut, $normalizeDepths } from "../nesting";
import {
  $blockGroup,
  $createFormTitleNode,
  $createOptionNode,
  $depth,
  $ensureBlockIds,
  $ensureQuestionFields,
  $isFoldedAway,
  $isFormTitleNode,
  $isInput,
  $isOptionNode,
  $isPageHead,
  $isShowHideNode,
  $nextBlock,
  $normalizePages,
  $prevBlock,
  $setDepth,
  $settings,
  $shareQuestionSettings,
  $withNested,
  choiceKindState,
  FormTitleNode,
} from "../nodes";
import { $foldQuestion, $isFolded, $selectNodes } from "./blocks";

/** The top-level block holding a collapsed caret. */
export function $caretBlock() {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const block = selection.anchor.getNode().getTopLevelElement();

  return block && { selection, block };
}

export function $atEdge(selection: RangeSelection, block: ElementNode, start: boolean) {
  const { anchor } = selection;
  const node = anchor.getNode();

  if (node.is(block))
    return start ? anchor.offset === 0 : anchor.offset === block.getChildrenSize();
  const edge = start ? block.getFirstDescendant() : block.getLastDescendant();

  return !!edge?.is(node) && anchor.offset === (start ? 0 : node.getTextContentSize());
}

/** The nearest visible text block in reading order, skipping widgets and folded content. */
export function $editableSibling(block: LexicalNode, forward: boolean): ElementNode | null {
  for (let node = $step(block, forward); node; node = $step(node, forward))
    if ($isElementNode(node) && !$isFoldedAway(node)) return node;

  return null;
}

export const $step = (block: LexicalNode, forward: boolean) =>
  forward ? $nextBlock(block) : $prevBlock(block);

/** An input whose caret sits in an empty, hidden slot beside its drawn box. */
export const $isDrawnInput = (node: LexicalNode | null | undefined) =>
  $isElementNode(node) && $isInput(node) && !$isOptionNode(node);

/**
 * Enter leaves an empty option as a text line. At a block's start it inserts above, except on the form title.
 * Between options it inserts another option; splitting a heading leaves the remainder as ordinary text.
 */
export const registerFormEnterBehavior = (editor: LexicalEditor) =>
  editor.registerCommand(INSERT_PARAGRAPH_COMMAND, $enter, COMMAND_PRIORITY_LOW);

/** Enter, from the caret; false leaves it to Lexical. */
export function $enter() {
  const caret = $caretBlock();

  if (!caret) return false;
  const { selection, block } = caret;
  const head = $enterInHead(block, $atEdge(selection, block, true));

  if (head !== undefined) return head;

  if (block.isEmpty()) {
    const next = $nextBlock(block);

    if ($isParagraphNode(block) && $depth(block) > 0 && (!next || $depth(next) < $depth(block))) {
      $moveOut(block);
      block.selectStart();

      return true;
    }

    if ($enterList(block, selection, true)) return true;

    if (!$isOptionNode(block)) return false;
    block.replace($setDepth($createParagraphNode(), $depth(block))).selectStart();

    return true;
  }

  // Insert after the whole folded question so the new line stays visible.
  if ($isFolded(block) && $atEdge(selection, block, false)) {
    const line = $setDepth($createParagraphNode(), $depth(block));
    $withNested($blockGroup(block)).at(-1)!.insertAfter(line);
    line.selectStart();

    return true;
  }

  if ($isOptionNode(block) && $settings(block).other && $atEdge(selection, block, false)) {
    const line = $setDepth($createParagraphNode(), $depth(block)); // after "Other", a text line rather than another option
    $withNested([block]).at(-1)!.insertAfter(line);
    line.selectStart();

    return true;
  }

  const atStart = $atEdge(selection, block, true);

  if ($enterHeading(block, selection, atStart) || $enterList(block, selection, atStart))
    return true;

  if (!atStart) return false;

  if (!$isFormTitleNode(block)) {
    const betweenOptions =
      $isOptionNode(block) && !$blockGroup(block).find($isOptionNode)!.is(block);

    const line = betweenOptions
      ? $createOptionNode($getState(block, choiceKindState))
      : $createParagraphNode();

    block.insertBefore($setDepth(line, $depth(block)));
  }

  return true;
}

/**
 * Edge deletion removes an empty block or merges into the nearest text block, even across widgets.
 * The form title survives deletion, and deleting an empty final block leaves an ordinary text line.
 */
export function registerFormDeleteBehavior(editor: LexicalEditor) {
  const $delete = (backward: boolean, event: KeyboardEvent) => {
    const caret = $caretBlock();

    if (!caret || !$atEdge(caret.selection, caret.block, backward)) return false;
    const { block } = caret;
    event.preventDefault();

    if ($isFormTitleNode(block) && (backward || block.isEmpty())) return true;

    if (backward && ($exitList(block) || $exitCallout(block) || $exitDisclosure(block)))
      return true;
    const target = $editableSibling(block, !backward);

    if ($deleteAtHead(block, backward, target)) return true;

    if (block.isEmpty()) {
      if (!backward && !$nextBlock(block)) {
        if (!$isParagraphNode(block)) block.replace($createParagraphNode()).selectStart();

        return true;
      }

      // The caret goes to the neighbour in the key's direction, or back the other way at the form's end
      const [next, atStart] = target
        ? [target, !backward]
        : [$editableSibling(block, backward), false];

      block.remove();

      if (atStart) next?.selectStart();
      else next?.selectEnd();

      return true;
    }

    if (!target) return true;

    // A drawn input can't take the neighbouring text (its slot stays empty), so the key selects it, as it would any
    // non-text block: a second press deletes it through the block selection
    if ($isDrawnInput(target)) return ($selectNodes([target]), true);

    if (backward) {
      target.selectEnd(); // the join, once the text is in
      target.append(...block.getChildren());
      block.remove();
    } else {
      block.append(...target.getChildren());
      target.remove();
    }

    return true;
  };

  return mergeRegister(
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => $delete(true, event),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_DELETE_COMMAND,
      (event) => $delete(false, event),
      COMMAND_PRIORITY_LOW,
    ),
  );
}

/** Option labels are plain text. Multiline paste creates separate options and folds long lists. */
export function plainTextBlocks(editor: LexicalEditor) {
  const $plain = () => {
    const selection = $getSelection();

    const block = $isRangeSelection(selection)
      ? selection.anchor.getNode().getTopLevelElement()
      : null;

    return $isRangeSelection(selection) &&
      ($isOptionNode(block) || $isShowHideNode(block) || $isPageHead(block))
      ? { selection, block }
      : null;
  };

  return mergeRegister(
    editor.registerCommand(INSERT_LINE_BREAK_COMMAND, () => !!$plain(), COMMAND_PRIORITY_LOW),
    editor.registerCommand(FORMAT_TEXT_COMMAND, () => !!$plain(), COMMAND_PRIORITY_LOW),
    editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const target = $plain();

        const text =
          event instanceof ClipboardEvent ? event.clipboardData?.getData("text/plain") : undefined;

        if (!target || !text) return false;
        event.preventDefault();
        const { selection, block } = target;

        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        if ($pasteDisclosure(selection, block, text)) return true;

        if ($isPageHead(block)) return (selection.insertText(lines.join(" ")), true);
        selection.insertText(lines[0] ?? "");
        let last = $withNested([block]).at(-1)!;

        for (const line of lines.slice(1))
          last = last.insertAfter(
            $setDepth($createOptionNode($getState(block, choiceKindState)), $depth(block)).append(
              $createTextNode(line),
            ),
          );

        if (lines.length > 1 && $isOptionNode(last)) last.selectEnd();

        if (lines.length > 20) $foldQuestion(block, true);

        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}

/** Restore the single leading form title and normalise identities, shared question settings, nesting and pages. */
export function keepFormTitle(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerNodeTransform(RootNode, (root) => {
      const first = root.getFirstChild();

      if ($isFormTitleNode(first)) return;

      if (first) first.insertBefore($createFormTitleNode());
      else root.append($createFormTitleNode());
    }),
    // A title anywhere else (pasted, say) turns into plain text
    editor.registerNodeTransform(FormTitleNode, (title) => {
      if (!title.is($getRoot().getFirstChild())) title.replace($createParagraphNode(), true);
    }),
    editor.registerNodeTransform(RootNode, $normalizeDepths),
    editor.registerNodeTransform(RootNode, $shareQuestionSettings),
    editor.registerNodeTransform(RootNode, $ensureBlockIds),
    editor.registerNodeTransform(RootNode, $ensureQuestionFields),
    editor.registerNodeTransform(RootNode, $normalizePages),
  );
}

/**
 * Typing only ever goes where you put the caret (gap check #1). Lexical can be left with no selection while the editor
 * keeps the focus: Esc twice, deleting selected blocks, a click on a widget, a rubber band that selects nothing. The
 * browser then types at the editor's start, into the form title. So a click on text while blocks are selected puts the
 * caret there (rich text's own click handler only empties the block selection), and an editor left with nothing
 * selected lets go of the focus.
 */
export function keepCaret(editor: LexicalEditor) {
  const onMarkerDown = (event: MouseEvent) => {
    const marker =
      event.button === 0 && event.target instanceof Element
        ? event.target.closest("[data-marker]")
        : null;

    if (!marker) return;
    event.preventDefault();
    editor.getRootElement()?.focus({ preventScroll: true });
    // Discrete: the caret is in place before the next key arrives
    editor.update(() => $getNearestNodeFromDOMNode(marker)?.getTopLevelElement()?.selectStart(), {
      discrete: true,
    });
  };

  return mergeRegister(
    // With blocks selected Lexical drops the DOM selection, so the browser would type a key at the editor's start,
    // into the form title, backwards. There's no text to type into: the key does nothing
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (
          event.key.length !== 1 ||
          event.metaKey ||
          event.ctrlKey ||
          !$isNodeSelection($getSelection())
        )
          return false;
        event.preventDefault();

        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    // A list number or an option's box sits outside the text: pressing on it puts the caret at the line's start. On
    // mousedown, before the browser can leave its own caret nowhere (the marker isn't editable); focus first, so Lexical
    // puts the DOM caret where its selection is
    editor.registerRootListener((root, previous) => {
      previous?.removeEventListener("mousedown", onMarkerDown);
      root?.addEventListener("mousedown", onMarkerDown);
    }),
    // Input boxes are drawn, with nothing to type in: a click selects their block
    editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const drawn =
          event.target instanceof Element
            ? event.target.closest("[data-date], [data-drawn]")
            : null;

        const block = drawn && $getNearestNodeFromDOMNode(drawn)?.getTopLevelElement();

        if (!block) return false;
        $selectNodes([block]);

        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    ),
    editor.registerCommand(
      CLICK_COMMAND,
      () => {
        if (!$isNodeSelection($getSelection())) return false;
        const range = $createRangeSelectionFromDom(window.getSelection(), editor);

        if (!range) return false;
        $setSelection(range);

        return true;
      },
      COMMAND_PRIORITY_LOW, // ahead of rich text's handler, at the editor's priority
    ),
    editor.registerUpdateListener(({ editorState }) => {
      const root = editor.getRootElement();

      if (!root || document.activeElement !== root) return;

      const lost = editorState.read(
        () => {
          const selection = $getSelection();

          return !selection || ($isNodeSelection(selection) && !selection.getNodes().length);
        },
        { editor },
      );

      if (lost) root.blur();
    }),
  );
}
