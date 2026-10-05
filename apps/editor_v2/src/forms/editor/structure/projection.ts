import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  CUT_COMMAND,
  KEY_DOWN_COMMAND,
  mergeRegister,
  setDOMUnmanaged,
  type LexicalEditor,
} from "lexical";
import {
  $blockGroup,
  $blockKind,
  $formBlocks,
  $isFoldedAway,
  $isInput,
  $isOptionNode,
  $isPageBreak,
  $isQuestionNode,
  $nested,
  $settings,
} from "../nodes";
import { fieldWidthOf } from "../preset-settings";
import type { FieldWidth } from "../../core/field-settings";

/**
 * Keys pressed in a decorator's inputs and dropdowns are theirs. Lexical otherwise runs them
 * against its last selection: Enter in a field would add a paragraph, ⌘Z would undo the form.
 */
export function isolateDecorators(editor: LexicalEditor) {
  const inDecorator = (event: Event | null) =>
    event?.target instanceof Element && !!event.target.closest("[data-lexical-decorator]");

  return mergeRegister(
    editor.registerCommand(KEY_DOWN_COMMAND, inDecorator, COMMAND_PRIORITY_CRITICAL),
    editor.registerCommand(CUT_COMMAND, inDecorator, COMMAND_PRIORITY_CRITICAL),
  );
}

/** Mark the caret’s block and retain the add-option affordance while the caret remains inside its option list. */
export function markCurrentBlock(editor: LexicalEditor) {
  let current: HTMLElement | null = null;
  let adding: HTMLElement | null = null;

  const mark = (el: HTMLElement | null) => {
    current?.removeAttribute("data-current");
    current = el;
    current?.setAttribute("data-current", "");
  };

  return mergeRegister(
    editor.registerUpdateListener(({ editorState }) => {
      if (document.activeElement !== editor.getRootElement()) return;
      editorState.read(
        () => {
          const selection = $getSelection();

          const block = $isRangeSelection(selection)
            ? selection.anchor.getNode().getTopLevelElement()
            : null;

          mark(block && editor.getElementByKey(block.getKey()));

          if (!block) return;

          const last = $isOptionNode(block)
            ? $blockGroup(block).filter($isOptionNode).at(-1)
            : undefined;

          adding?.removeAttribute("data-adding");
          adding = last && !$nested(last).length ? editor.getElementByKey(last.getKey()) : null;
          adding?.setAttribute("data-adding", "");
        },
        { editor },
      );
    }),
    editor.registerCommand(BLUR_COMMAND, () => (mark(null), false), COMMAND_PRIORITY_LOW),
  );
}

/**
 * Project shared question settings onto labels, hints and answer blocks. Optional markers belong on the first
 * visible block; hidden and folded states also apply to plain Lexical paragraphs and headings.
 * This walks all blocks because each projection may depend on neighbouring blocks in its question.
 */
export function markBlocks(editor: LexicalEditor) {
  return editor.registerUpdateListener(({ editorState }) =>
    editorState.read(
      () => {
        const hints = new Set<string>();

        for (const block of $formBlocks()) {
          if ($isQuestionNode(block))
            for (const inner of $blockGroup(block))
              if ($isParagraphNode(inner)) hints.add(inner.getKey());
        }

        const widths = new Map<string, FieldWidth | undefined>();

        for (const block of $formBlocks()) {
          if (!$isInput(block) || widths.has(block.getKey())) continue;
          const width = fieldWidthOf($blockKind(block), $settings(block));

          for (const inner of $blockGroup(block)) widths.set(inner.getKey(), width);
        }

        for (const block of $formBlocks()) {
          const dom = editor.getElementByKey(block.getKey());

          if (!dom) continue;

          if (!$isPageBreak(block)) dom.hidden = $isFoldedAway(block);
          dom.toggleAttribute("data-hidden", !!$settings(block).hidden);
          dom.toggleAttribute("data-hint", hints.has(block.getKey()));
          const width = widths.get(block.getKey());

          if (width === "short" || width === "medium") dom.dataset.width = width;
          else delete dom.dataset.width;
          const firstAnswer = $blockGroup(block).find($isInput);
          const disabled = !!firstAnswer && $settings(firstAnswer).isDisabled === true;
          dom.toggleAttribute("data-disabled", disabled && $isInput(block));
          let disabledTag = dom.querySelector<HTMLElement>(":scope > [data-disabled-tag]");

          if ($isInput(block) && disabled && !disabledTag) {
            disabledTag = dom.ownerDocument.createElement("span");
            disabledTag.dataset.disabledTag = "";
            disabledTag.contentEditable = "false";
            disabledTag.className = "mb-2 inline-block text-12 font-semibold text-muted";
            disabledTag.textContent = "Disabled";
            disabledTag.title =
              "People cannot answer this field. You can still edit its question and settings.";
            setDOMUnmanaged(disabledTag);
            dom.prepend(disabledTag);
          }

          if (disabledTag) disabledTag.hidden = !disabled;
          const optional = dom.querySelector<HTMLElement>("[data-optional]");

          if (!optional) continue;
          const group = $blockGroup(block);
          const input = group.find($isInput);
          optional.hidden = !(input && !$settings(input).required && block.is(group[0]));
        }
      },
      { editor },
    ),
  );
}
