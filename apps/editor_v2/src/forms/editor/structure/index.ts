import { mergeRegister, type LexicalEditor } from "lexical";
import { registerEditorHistory } from "../../../editor/core/history";
import { markNesting } from "../nesting";
import { blockClipboard } from "./clipboard";
import {
  registerFormDeleteBehavior,
  registerFormEnterBehavior,
  keepCaret,
  keepFormTitle,
  plainTextBlocks,
} from "./editing";
import { blockShortcuts, builderHotkeys, followUpKey, markdownShortcuts } from "./keyboard";
import { skipWidgets } from "./navigation";
import { isolateDecorators, markBlocks, markCurrentBlock } from "./projection";
import { rubberBand } from "./rubber-band";
import { selectBlocks } from "./selection";

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

export { pushStep, registerEditorHistory, type Step } from "../../../editor/core/history";

export {
  $blockZone,
  $dragged,
  $dropBlocks,
  $dropCheck,
  $duplicateBlocks,
  $duplicateQuestion,
  $foldableTitle,
  $foldQuestion,
  $hideBlocks,
  $isFolded,
  $moveBlocks,
  $removeBlocks,
  $selectedBlocks,
  $withGroups,
  type DropZone,
} from "./blocks";

export { $enter } from "./editing";

export {
  $addTitle,
  $isUntitled,
  composing,
  hotkey,
  OPEN_BULK_INSERT_COMMAND,
  shortcuts,
} from "./keyboard";

export { touchFirst } from "./rubber-band";

export { $blockAtDOM } from "./selection";
