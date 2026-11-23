import { mergeRegister, type LexicalEditor } from "lexical";
import { registerEditorHistory } from "@/editor";
import { markNesting } from "../nesting";
import { blockClipboard } from "./structure-clipboard";
import {
  registerFormDeleteBehavior,
  registerFormEnterBehavior,
  keepCaret,
  keepFormTitle,
  plainTextBlocks,
} from "./structure-editing";
import {
  blockShortcuts,
  builderHotkeys,
  followUpKey,
  markdownShortcuts,
} from "./structure-keyboard";
import { skipWidgets } from "./structure-navigation";
import { isolateDecorators, markBlocks, markCurrentBlock } from "./structure-projection";
import { rubberBand } from "./structure-rubber-band";
import { selectBlocks } from "./structure-selection";

// Registers form-specific editing, selection and navigation behavior.

export const registerBehaviors = (editor: LexicalEditor) =>
  mergeRegister(
    isolateDecorators(editor),
    registerEditorHistory(editor),
    markCurrentBlock(editor),
    markBlocks(editor),
    markNesting(editor),
    registerFormEnterBehavior(editor),
    registerFormDeleteBehavior(editor),
    skipWidgets(editor),
    selectBlocks(editor),
    blockClipboard(editor), // before plainTextBlocks: a block paste into an option is still blocks
    plainTextBlocks(editor),
    keepFormTitle(editor),
    keepCaret(editor),
    builderHotkeys(editor),
    blockShortcuts(editor),
    followUpKey(editor),
    markdownShortcuts(editor),
    rubberBand(editor),
  );

export { pushStep, registerEditorHistory, type Step } from "@/editor";

export {
  $blockZone,
  $canMovePage,
  $dragged,
  $dropBlocks,
  $dropCheck,
  $duplicateBlocks,
  $duplicateQuestion,
  $foldableTitle,
  $foldQuestion,
  $hideBlocks,
  $isFolded,
  $mergeWithPreviousPage,
  $moveBlocks,
  $pageQuestionCount,
  $removeBlocks,
  $selectedBlocks,
  $withGroups,
  type DropZone,
} from "./structure-blocks";

export { $enter } from "./structure-editing";

export {
  $addTitle,
  $isUntitled,
  hotkey,
  OPEN_BULK_INSERT_COMMAND,
  shortcuts,
} from "./structure-keyboard";

export { touchFirst } from "./structure-rubber-band";

export { $blockAtDOM } from "./structure-selection";
