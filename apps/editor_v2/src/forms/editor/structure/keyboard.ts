import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  mergeRegister,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { OPEN_FOLLOW_UP_COMMAND } from "../../features/logic/authoring";
import { editorDefinition } from "../../../editor/core/context";
import { headingShortcuts } from "../../../editor/modules/headings/editing";
import { headingEntries } from "../../../editor/modules/headings/insertion";
import { listShortcuts } from "../../../editor/modules/lists/editing";
import { listEntries } from "../../../editor/modules/lists/insertion";
import { registerOutsideKeys } from "../../../editor/react/active-editor";
import { $insertBlocks } from "../insertion";
import { $canAddFollowUp } from "../nesting";
import {
  $addLogicAfter,
  $blockGroup,
  $createOptionNode,
  $createPageTitleNode,
  $createQuestionNode,
  $createWidgetNode,
  $depth,
  $headStart,
  $isFormTitleNode,
  $isInput,
  $isOptionNode,
  $isQuestionNode,
  $setDepth,
  $setSettings,
  $settings,
  $settingsHolder,
  $toggleHidden,
  $updateSettings,
} from "../nodes";
import {
  $duplicateBlocks,
  $duplicateQuestion,
  $foldQuestion,
  $hideBlocks,
  $selectedBlocks,
} from "./blocks";
import { $caretBlock } from "./editing";
import { $blockAtDOM } from "./selection";

export const isMac = /Mac|iPhone|iPad/.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent,
);

/** Normalise modifier order and letter case for shortcut lookup. */
export const hotkey = (e: KeyboardEvent) =>
  `${e.metaKey ? "cmd+" : ""}${e.ctrlKey ? "ctrl+" : ""}${e.shiftKey ? "shift+" : ""}${e.altKey ? "alt+" : ""}${/^[A-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key}`;

export const composing = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;

export const undoKeys = new Map<string, LexicalCommand<void>>([
  ["cmd+z", UNDO_COMMAND],
  ["ctrl+z", UNDO_COMMAND],
  ["cmd+shift+z", REDO_COMMAND],
  ["ctrl+y", REDO_COMMAND],
]);

// On macOS, Option changes event.key to the resulting character († and curly quotes).
export const titleKeys: Record<string, true> = isMac ? { "alt+†": true } : { "alt+t": true };

export const foldKeys: Record<string, boolean> = isMac
  ? { "cmd+alt+“": true, "cmd+alt+‘": false }
  : { "ctrl+[": true, "ctrl+]": false };

// On other platforms, selection shortcuts reverse the single-question fold direction.
export const selectedFoldKeys: Record<string, boolean> = isMac
  ? foldKeys
  : { "ctrl+shift+[": false, "ctrl+shift+]": true };

/** Apply matched shortcuts to the caret's block, falling back to the hovered block, or the first selected block for folding. */
export function $builderHotkey(editor: LexicalEditor, event: KeyboardEvent) {
  const key = hotkey(event);
  const command = undoKeys.get(key);

  if (command) return (event.preventDefault(), editor.dispatchCommand(command, undefined), true);

  if (key === "ctrl+shift+z") return (event.preventDefault(), true); // Redo uses Ctrl+Y; suppress Lexical's additional binding.
  const [title, fold, selectedFold] = [titleKeys[key], foldKeys[key], selectedFoldKeys[key]];

  if (title === undefined && fold === undefined && selectedFold === undefined) return false;
  const root = editor.getRootElement();
  const selection = $getSelection();

  const caret =
    root === document.activeElement && $isRangeSelection(selection)
      ? selection.anchor.getNode().getTopLevelElement()
      : null;

  const hovered = root ? [...root.querySelectorAll(":hover")].at(-1) : undefined;
  const hover = hovered ? $blockAtDOM(hovered) : null;

  if (title) {
    event.preventDefault();
    const block = caret && $isInput(caret) ? caret : hover && $isInput(hover) ? hover : null;

    if (block) $addTitle(block);
  }

  if (fold !== undefined) {
    event.preventDefault();
    const block = caret ?? hover;

    if (block) $foldQuestion(block, fold);
  }

  const [first] = $selectedBlocks();

  if (selectedFold !== undefined && first) $foldQuestion(first, selectedFold);

  return true;
}

/** Keep undo available after gutter actions move focus outside the editor; external fields retain their own keys. */
export function builderHotkeys(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => !composing(event) && $builderHotkey(editor, event),
      COMMAND_PRIORITY_LOW,
    ),
    registerOutsideKeys(editor, (event) => editor.update(() => $builderHotkey(editor, event))),
  );
}

/** Asks the gutter to open "Bulk insert options" for the question holding this block (⌘⇧O). */
export const OPEN_BULK_INSERT_COMMAND = createCommand<NodeKey>("OPEN_BULK_INSERT_COMMAND");

// Choice shortcuts start with one required option and no question label.
export const required = <T extends LexicalNode>(node: T) => $setSettings(node, { required: true });

export const shortcuts = Object.assign(
  {
    "[]": () => [required($createOptionNode("checkboxes"))],
    "[a]": () => [required($createOptionNode("multiple-choice"))],
    "[v]": () => [required($createOptionNode("dropdown"))],
  },
  headingShortcuts,
  listShortcuts,
  // GovBB forms have no divider, and "---" is a new page in our markdown too.
  { "---": () => [$createWidgetNode("page-break"), $createPageTitleNode()] },
);

/** Convert shortcuts on keyup only, so pasting or undoing back to a marker does not convert it. */
export function markdownShortcuts(editor: LexicalEditor) {
  const onKeyUp = (event: KeyboardEvent) => {
    if (!editor.isEditable() || composing(event) || !["]", " ", "-"].includes(event.key)) return;
    editor.update(() => {
      const block = $caretBlock()?.block;
      const marker = $isParagraphNode(block) ? block.getTextContent() : "";
      const make = shortcuts[marker];

      if (!block || !make || !editor.isEditable()) return;

      const content = [...headingEntries, ...listEntries].find((entry) =>
        entry.shortcuts?.includes(marker),
      );

      if (content && !editorDefinition(editor).actions.some((action) => action.id === content.id))
        return;
      $insertBlocks(make(), block.clear());
    });
  };

  return editor.registerRootListener((root, previous) => {
    previous?.removeEventListener("keyup", onKeyUp);
    root?.addEventListener("keyup", onKeyUp);
  });
}

export const $isUntitled = (node: LexicalNode) =>
  $isInput(node) && !$blockGroup(node).some($isQuestionNode);

export function $addTitle(node: LexicalNode) {
  if (!$isUntitled(node)) return;
  const title = $setDepth($createQuestionNode(), $depth(node));
  $blockGroup(node)[0]!.insertBefore(title);
  title.selectStart();
}

/** Ctrl+D duplicates on non-Mac platforms; macOS keeps its native forward-delete binding. */
export function blockShortcuts(editor: LexicalEditor) {
  const $toggleRequired = (node: LexicalNode) => {
    const input = $settingsHolder(node);

    if ($isInput(input)) $updateSettings(input, { required: !$settings(input).required });
  };

  const $bulkInsert = (node: LexicalNode) => {
    if ($blockGroup(node).some($isOptionNode))
      editor.dispatchCommand(OPEN_BULK_INSERT_COMMAND, node.getKey());
  };

  const withShift = new Map<string, (node: LexicalNode) => void>([
    ["h", $toggleHidden],
    ["l", $addLogicAfter],
    ["r", $toggleRequired],
    ["o", $bulkInsert],
  ]);

  return editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      if (composing(event) || !(event.metaKey || event.ctrlKey) || event.altKey) return false;
      const selection = $getSelection();
      const selected = $selectedBlocks();

      const top = $isRangeSelection(selection)
        ? selection.anchor.getNode().getTopLevelElement()
        : (selected[0] ?? null);

      const block = top && $headStart(top);
      const key = event.key.toLowerCase();

      let run = event.shiftKey
        ? withShift.get(key)
        : key === "d" && (event.metaKey || !isMac)
          ? $duplicateQuestion
          : undefined;

      if (!run || !block || $isFormTitleNode(block)) return false;
      event.preventDefault(); // these are browser shortcuts too: bookmark, hard reload…

      // Duplicate and hide apply to the whole selection; logic insertion requires a single block.
      if (selected.length && key === "d") run = () => $duplicateBlocks(selected);

      if (selected.length && key === "h") run = () => $hideBlocks(selected);

      if (selected.length > 1 && key === "l") return true;
      run(block);

      return true;
    },
    COMMAND_PRIORITY_LOW,
  );
}

/** ⌥↵ puts a follow-up under the option holding the caret. */
export function followUpKey(editor: LexicalEditor) {
  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      if (
        !event ||
        !event.altKey ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        composing(event)
      )
        return false;
      const block = $caretBlock()?.block;

      if (!$isOptionNode(block) || !$canAddFollowUp(block)) return false;
      event.preventDefault();
      editor.dispatchCommand(OPEN_FOLLOW_UP_COMMAND, block.getKey());

      return true;
    },
    COMMAND_PRIORITY_LOW,
  );
}
