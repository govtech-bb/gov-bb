import { useEditable, useEditableUpdate } from "../conditional-logic/logic-hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $addUpdateTag,
  HISTORY_PUSH_TAG,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getState,
  $isParagraphNode,
  $isRangeSelection,
  $onUpdate,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  SKIP_DOM_SELECTION_TAG,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { Plus, TextAlignLeft, Trash } from "@phosphor-icons/react";
import { useEffect, useReducer, useRef, useState } from "react";
import { Kbd } from "../../ui/kbd";
import { Tip } from "../../ui/tooltip";
import {
  BlockRail,
  DropLine,
  menuKey,
  RailButton,
  useBlockControls,
  BlockMenuRoot,
  BlockGrip,
  type Line,
  toastWithUndo,
  altKey,
  InsertDialog,
} from "@/editor/react";
import {
  $dropBlocks,
  $dropCheck,
  $duplicateBlocks,
  $duplicateQuestion,
  $foldQuestion,
  $hideBlocks,
  $isFolded,
  $mergeWithPreviousPage,
  $moveBlocks,
  $removeBlocks,
  $selectedBlocks,
  OPEN_BULK_INSERT_COMMAND,
  type DropZone,
} from "./structure";
import {
  $createLogic,
  focusLogic,
  OPEN_FOLLOW_UP_COMMAND,
} from "../conditional-logic/logic-authoring";
import { BlockMenu, type BlockMenuActions, type BlockMenuModel } from "./block-menu";
import { $describePage, deletePageLabel, PageMenu } from "./page-menu";
import { BulkInsertDialog } from "./bulk-insert";
import { $native } from "../formats/native/native-state";
import {
  $setNativeErrorMessage,
  nativeErrorMessages,
} from "../formats/native/native-field-controls";
import { FoldActions, TitleHints } from "./form-chrome";
import { NestRails } from "./nest-rails";
import { $canAddFollowUp, $hostOf, $moveOut } from "./nesting";
import {
  $headEnd,
  $isPageHead,
  $pageHead,
  $blockGroup,
  $blockKind,
  $canHide,
  $createOptionNode,
  $depth,
  $hintBlocks,
  $isFormTitleNode,
  $isInput,
  $isListLine,
  $isOptionNode,
  $isPageBreak,
  $isQuestionNode,
  $isShowHideNode,
  $nested,
  $nextBlock,
  $questionKey,
  $settings,
  $editHint,
  $setDepth,
  $setSettings,
  $settingsHolder,
  $toggleHidden,
  $turnInto,
  $updateSettings,
  $wholePage,
  $withNested,
  choiceKindState,
  $turnIntoGroups,
} from "./form-nodes";
import { kindIcon } from "../conditional-logic/logic-icons";
import { $fieldArrayMenu } from "../repetition/repetition-queries";
import { $ssbIds, messagesFor } from "../formats/legacy-ssb/legacy-ssb-rules";
import { $hasConditionalLogic, $installedField } from "./field-context";

// Actions sit centred on each block's first line (the strip is 30px tall): the label's, the box's, the page line's
const offsets = new Map([
  ["question", 22], // 24px over a 27px line
  ["paragraph", 3],
  ["bullet", 3],
  ["inset", 19],
  ["warning", 19],
  ["show-hide", 7],
  ["h1", 37],
  ["h2", 29],
  ["h3", 23],
  ["calculated-fields", 9],
  ["page-break", 62], // the desk between the sheets, under the 48px end of the page above
  ["conditional-logic", 2],
]);

const DRAG_TYPE = "application/x-form-block";

/** A block's box in the anchor's coordinates, or null while it's hidden (folded away). */
function boxOf(editor: LexicalEditor, anchor: HTMLElement, node: LexicalNode) {
  const el = editor.getElementByKey(node.getKey());

  if (!el?.getClientRects().length) return null;
  const [r, a] = [el.getBoundingClientRect(), anchor.getBoundingClientRect()];
  const room = el.querySelector<HTMLElement>("[data-repeat-room]")?.offsetHeight ?? 0;

  return {
    el,
    left: r.left - a.left,
    top: r.top - a.top + room,
    right: r.right - a.left,
    bottom: r.bottom - a.top,
  };
}

/** Extend row hit areas slightly upward so the top edge remains easy to target. */
const $rowAt = (editor: LexicalEditor, anchor: HTMLElement, y: number, above: number) =>
  $getRoot()
    .getChildren()
    .findLast((node) => {
      const box = boxOf(editor, anchor, node);

      return box && box.top - above <= y;
    });

type Place = { key: NodeKey; top: number; left: number };

/** Where a block's actions go: on its first line. */
function $placeOf(editor: LexicalEditor, anchor: HTMLElement, block: LexicalNode): Place | null {
  const box = boxOf(editor, anchor, block);

  if (!box || $isFormTitleNode(block) || $isPageHead(block)) return null;
  // A dropdown's first option carries the closed select: its actions sit level with the select
  const select = box.el.querySelector(":scope > [data-select]") ? 6 : 0;

  const legend =
    box.el.querySelector<HTMLElement>(":scope > [data-repeat-legend]")?.offsetHeight ?? 0;

  const field = $isInput(block) ? $installedField($blockKind(block)) : undefined;
  const offset = field ? field.gutterOffset : (offsets.get($blockKind(block)) ?? 0);

  return {
    key: block.getKey(),
    top: box.top + ($isListLine(block) ? 3 : offset) + select + legend,
    left: parseFloat(box.el.style.getPropertyValue("--nest")) || 0,
  };
}

function $hoverAt(editor: LexicalEditor, anchor: HTMLElement, y: number) {
  const block = $rowAt(editor, anchor, y, 0) ?? $getRoot().getFirstChild();

  return block ? $placeOf(editor, anchor, block) : null;
}

/** A drop zone under a point, and the line it draws. */
type Hit = { zone: DropZone; line: Line };

/** Drop zones span both gutters because this layout has no column-side targets. */
function $zoneAt(editor: LexicalEditor, anchor: HTMLElement, x: number, y: number): Hit | null {
  const root = editor.getRootElement();
  // The editor's gutters: 100px, 25px under 576px; the line reaches 5px into them at 100px only
  const gutter = (root && parseFloat(getComputedStyle(root).paddingLeft)) || 100;
  const inset = gutter < 100 ? 0 : 5;
  const found = $rowAt(editor, anchor, y, 5);
  const row = found && !($isPageBreak(found) && $settings(found).folded) ? $headEnd(found) : found;
  const box = row && boxOf(editor, anchor, row);
  const bounds = root?.getBoundingClientRect();
  const left = anchor.getBoundingClientRect().left;

  if (!row || !box || !bounds || x < bounds.left - left || x >= bounds.right - left) return null;

  const line = {
    left: box.left - inset,
    width: box.right - box.left + 2 * inset,
    top: box.bottom - 8,
  };

  if ($isPageBreak(row) && $settings(row).folded) line.top += 25; // a folded page's line draws lower

  return { zone: { target: row.getKey() }, line };
}

/**
 * Keep block controls outside contenteditable. Keyboard users can reach the caret's controls with Tab
 * or open its menu with ⌘/.
 */
export function Gutter({ anchor }: { anchor: HTMLElement }) {
  const [editor] = useLexicalComposerContext();
  const editable = useEditable();
  const update = useEditableUpdate();
  // The menu came from ⌘/, or left the caret in a hint: closing it goes back to the caret, not to the handle
  const toCaret = useRef(false);
  const [insertInto, setInsertInto] = useState<NodeKey | null>(null);
  const [followUpFor, setFollowUpFor] = useState<NodeKey | null>(null);
  const [bulkFor, setBulkFor] = useState<NodeKey | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const controls = useBlockControls(anchor, {
    target: {
      // Page buttons have their own controls
      $blockAt: (element, point) =>
        element.closest("[data-page-button-row]")
          ? null
          : ($hoverAt(editor, anchor, point.y)?.key ?? null),
      $caretBlock: () => {
        const selection = $getSelection();

        return $isRangeSelection(selection)
          ? (selection.anchor.getNode().getTopLevelElement()?.getKey() ?? null)
          : null;
      },
      // The table of offsets gives the top of the 30px-tall rail: its middle is 15px lower
      $place: (key) => {
        const node = $getNodeByKey(key);
        const place = node && $placeOf(editor, anchor, node);

        return place && { top: place.top + 15, left: place.left };
      },
    },
    // Move whole questions and selections together, wherever the form's rules allow
    drag: {
      type: DRAG_TYPE,
      $at: (key, point) => {
        const node = $getNodeByKey(key);
        const a = anchor.getBoundingClientRect();
        const at = node && $zoneAt(editor, anchor, point.x - a.left, point.y - a.top);

        return node && at && $dropCheck(node, at.zone).lit ? at : null;
      },
      $drop: (key, at) => {
        const node = $getNodeByKey(key);

        if (node) $dropBlocks(node, at.zone);
      },
    },
    onMenuOpen: (menu) => {
      toCaret.current = menu.byKeyboard;
    },
  });

  const { target } = controls;
  const menuOpen = !!controls.menu;
  const hovered = target?.pointed ? target.key : null;

  useEffect(
    () =>
      editor.registerCommand(
        OPEN_BULK_INSERT_COMMAND,
        (key) => (editor.isEditable() ? (setBulkFor(key), true) : false),
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );
  useEffect(
    () =>
      editor.registerCommand(
        OPEN_FOLLOW_UP_COMMAND,
        (key) => {
          const node = $getNodeByKey(key);

          if (!editor.isEditable() || !node || !$canAddFollowUp(node)) return false;
          setFollowUpFor(key);
          setInsertInto(key);

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  // While the menu is open: highlight the block's question group and track its edits.
  // With several blocks selected the menu acts on them, and they're blue already.
  const shownKey = target?.key;

  useEffect(() => {
    if (!menuOpen || !shownKey) return;

    const els = editor.read(() => {
      const node = $getNodeByKey(shownKey);

      // A page's menu acts on the whole page
      return node && $selectedBlocks().length < 2
        ? ($isPageBreak(node) ? $wholePage(node) : $withNested($blockGroup(node))).map((b) =>
            editor.getElementByKey(b.getKey()),
          )
        : [];
    });

    els.forEach((el) => el?.setAttribute("data-selected", ""));
    const unregister = editor.registerUpdateListener(rerender);

    return () => {
      unregister();
      els.forEach((el) => el?.removeAttribute("data-selected"));
    };
  }, [menuOpen, shownKey, editor]);

  // useBlockControls closes the menu as the editor turns read-only; the dialogs close with it
  useEffect(() => {
    const close = () => {
      setInsertInto(null);
      setFollowUpFor(null);
      setBulkFor(null);
    };

    return editor.registerEditableListener((value) => {
      if (!value) close();
    });
  }, [editor]);

  if (!editable) return <NestRails anchor={anchor} />;

  const dropLine = <DropLine line={controls.drag.line} />;

  const addFollowUp = (key: NodeKey) => editor.dispatchCommand(OPEN_FOLLOW_UP_COMMAND, key);

  // The committed state: editor.read() would flush pending updates in the middle of a render
  const modal = (
    <>
      <InsertDialog
        request={
          insertInto === null
            ? null
            : {
                targetKey: followUpFor ?? insertInto,
                mode: followUpFor ? "follow-up" : "insert",
              }
        }
        searchPlaceholder="Find questions, Form registry and layout blocks"
        onClose={() => {
          setInsertInto(null);
          setFollowUpFor(null);
        }}
      />
      <BulkInsertDialog
        open={bulkFor !== null}
        onOpenChange={(open) => !open && setBulkFor(null)}
        onInsert={(lines) =>
          update(() => {
            // New options go after the question's last block, in the question's kind
            const node = bulkFor === null ? null : $getNodeByKey(bulkFor);

            if (!node) return;
            const group = $blockGroup(node);
            const first = group.find($isOptionNode);
            const kind = first ? $getState(first, choiceKindState) : "checkboxes";
            let last = $withNested(group).at(-1)!;

            for (const line of lines)
              last = last.insertAfter(
                $setDepth($createOptionNode(kind), $depth(first ?? node)).append(
                  $createTextNode(line),
                ),
              );

            if (group.length + lines.length > 20) $foldQuestion(node, true);
          })
        }
      />
      <NestRails anchor={anchor} />
      <FoldActions anchor={anchor} hovered={hovered} />
      <TitleHints anchor={anchor} hovered={hovered} onFollowUp={addFollowUp} />
    </>
  );

  const state = target && editor.getEditorState().read(() => $describe(target.key), { editor });

  // A page has its own menu, on the whole page; with several blocks selected, the block menu acts on them all
  const page =
    target && state && !state.menu.multi
      ? editor.getEditorState().read(() => $describePage(target.key), { editor })
      : null;

  if (!target || !state)
    return (
      <>
        {dropLine}
        {modal}
      </>
    );
  const { key } = target;

  const remove = (whole: boolean, selected = false) =>
    update(() => {
      $addUpdateTag(HISTORY_PUSH_TAG);
      // Deleting from a selected block applies to the whole selection.
      const blocks = selected ? $selectedBlocks() : [];

      if (blocks.length) return ($removeBlocks(blocks), $setSelection(null));
      const node = $getNodeByKey(key);

      if (!node) return;

      // Leave an editable line at the end of the form. Move the caret explicitly because Lexical's replace
      // leaves it on the removed text.
      if (!$nextBlock(node) && !($isParagraphNode(node) && node.isEmpty())) {
        const selection = $getSelection();

        const inside =
          $isRangeSelection(selection) &&
          [selection.anchor, selection.focus].some(
            (point) => node.is(point.getNode()) || node.isParentOf(point.getNode()),
          );

        const line = node.replace($createParagraphNode());

        if (inside) line.selectStart();
      } else
        [
          ...(whole ? $withNested($isQuestionNode(node) ? $blockGroup(node) : [node]) : [node]),
          ...$pageHead(node),
        ].forEach((b) => b.remove());
    });

  // The tag keeps Lexical from putting the DOM selection back, which would pull focus out of the modal.
  const insertBelow = () => {
    let lineKey: NodeKey | null = null;
    update(
      () => {
        const node = $getNodeByKey(key);

        if (!node) return;

        // A folded page opens, so what goes in at its top shows
        if ($isPageBreak(node) && $settings(node).folded) $setSettings(node, { folded: undefined });

        // Insert after all the blocks in a folded question.
        const line =
          $isParagraphNode(node) && node.isEmpty()
            ? node
            : ($isFolded(node)
                ? $withNested($blockGroup(node)).at(-1)!
                : $headEnd(node)
              ).insertAfter($setDepth($createParagraphNode(), $depth(node)));

        lineKey = line.getKey();
      },
      { tag: SKIP_DOM_SELECTION_TAG, discrete: true },
    );

    if (lineKey) {
      setFollowUpFor(null);
      setInsertInto(lineKey);
    }
  };

  // Menu edits leave the DOM selection alone: putting it back in the editor would pull focus out of a menu field
  const onBlock = (fn: (node: LexicalNode) => void) => () =>
    update(
      () => {
        const node = $getNodeByKey(key);

        if (node) fn(node);
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );

  // A page goes with its questions, so its delete says so and offers a way back
  const deletePage = onBlock((node) => {
    $removeBlocks([node]);
    $onUpdate(() => toastWithUndo(editor, "Page deleted"));
  });

  const { multi } = state.menu;

  const actions: BlockMenuActions = {
    onSettings: (patch) => onBlock((node) => $updateSettings(node, patch))(),
    onFieldId: (fieldId) => onBlock((node) => $updateSettings(node, { fieldId }))(),
    onErrorMessage: (error, text) =>
      onBlock((node) => {
        if ("native" in error) {
          $addUpdateTag(HISTORY_PUSH_TAG);
          $setNativeErrorMessage($settingsHolder(node), error, text);

          return;
        }

        let rule = error.rule;

        if (rule === "onOrBefore") rule = "onOrAfter";
        const saved = $settings($settingsHolder(node)).errors;

        const errors =
          saved && typeof saved === "object" && !Array.isArray(saved) ? { ...saved } : {};

        if (text?.trim()) errors[rule] = text;
        else delete errors[rule];
        $updateSettings(node, { errors: Object.keys(errors).length ? errors : undefined });
      })(),
    onOptionValue: (optionKey, optionValue) =>
      onBlock(() => {
        const option = $getNodeByKey(optionKey);

        if ($isOptionNode(option)) {
          if ($native(option).option) $addUpdateTag(HISTORY_PUSH_TAG);
          $setSettings(option, { optionValue });
        }
      })(),
    onEditHint: () => {
      toCaret.current = true;
      update(
        () => {
          const node = $getNodeByKey(key);

          if (!node) return;

          if (!$hintBlocks(node)?.length) $addUpdateTag(HISTORY_PUSH_TAG);
          $foldQuestion(node, false);
          $editHint(node);
        },
        { discrete: true },
      );
      controls.closeMenu();
    },
    onRemoveHint: onBlock((node) => {
      $addUpdateTag(HISTORY_PUSH_TAG);
      $hintBlocks(node)?.forEach((hint) => hint.remove());
    }),
    onDelete: () => remove(true, multi),
    onDuplicate: onBlock(multi ? () => $duplicateBlocks($selectedBlocks()) : $duplicateQuestion),
    // Apply the initiating block's visibility choice to the whole selection.
    onHide: onBlock(multi ? (node) => $hideBlocks([node, ...$selectedBlocks()]) : $toggleHidden),
    onAddLogic: () => {
      let rule: NodeKey | undefined;
      update(
        () => {
          const node = $getNodeByKey(key);

          if (node && $hasConditionalLogic())
            rule = $createLogic(node, { id: crypto.randomUUID() }).getKey();
        },
        { discrete: true },
      );
      controls.closeMenu();

      if (rule) focusLogic(editor, rule);
    },
    onAddFollowUp: () => addFollowUp(key),
    onMoveOut: onBlock($moveOut),
    onBulkInsert: () => {
      if (editor.isEditable()) setBulkFor(key);
    },
    onTurnInto: (kind) => onBlock((node) => $turnInto($settingsHolder(node), kind))(),
    onClose: () => controls.closeMenu(),
  };

  // Back to the caret after ⌘/, else to the handle
  const finalFocus = () => {
    if (!toCaret.current) return true;
    toCaret.current = false;
    editor.focus();

    return false;
  };

  const deleteLabel = page ? deletePageLabel(page.questions) : "Delete this block";

  return (
    <>
      {dropLine}
      {modal}
      <BlockRail
        target={target}
        className="w-25 ps-0.5 pe-2.5 max-sm:w-6.25 max-sm:px-0 max-sm:[&>button:not(:last-of-type)]:hidden"
      >
        <Tip
          side="left"
          hint={!!state.whole}
          content={
            state.whole ? (
              <>
                <em>Click</em> to delete {state.whole}
                <br />
                <Kbd>{altKey}</Kbd>-<em>click</em> to delete this block
              </>
            ) : (
              deleteLabel
            )
          }
        >
          <RailButton
            aria-label={deleteLabel}
            onClick={(e) => (page ? deletePage() : remove(!e.altKey, true))}
            className="hover:bg-red-10 [&>svg]:w-4.25 hover:[&>svg]:text-red-80"
          >
            <Trash />
          </RailButton>
        </Tip>
        <Tip side="left" content="Insert block below">
          <RailButton
            aria-label="Insert block below"
            onClick={insertBelow}
            className="[&>svg]:size-4.5"
          >
            <Plus />
          </RailButton>
        </Tip>
        <BlockMenuRoot controls={controls}>
          <BlockGrip
            controls={controls}
            label="Block actions"
            side="left"
            tip={
              <>
                <em>Drag</em> to move
                <br />
                <em>Click</em> or <Kbd>{menuKey}</Kbd> to open menu
              </>
            }
          />
          {page ? (
            <PageMenu
              model={page}
              actions={{
                onMove: (down) => onBlock((node) => $moveBlocks([node], down))(),
                onDuplicate: onBlock($duplicateQuestion),
                onMerge: onBlock($mergeWithPreviousPage),
                onDelete: deletePage,
              }}
              finalFocus={finalFocus}
            />
          ) : (
            <BlockMenu model={state.menu} actions={actions} finalFocus={finalFocus} />
          )}
        </BlockMenuRoot>
      </BlockRail>
    </>
  );
}

/** What the gutter and menu need to know about a block, or null if it's gone. */
export function $describe(key: NodeKey) {
  const node = $getNodeByKey(key);

  if (!node) return null;
  const group = $blockGroup(node);
  // All blocks in a question share the first input's settings.
  const holder = $settingsHolder(node);
  const kind = $blockKind(holder);
  const field = $isInput(holder) ? $installedField(kind) : undefined;
  const ownedField = field;
  const title = group.find($isQuestionNode);

  const turnGroup =
    $isInput(holder) && !field?.turnInto
      ? undefined
      : $turnIntoGroups().find((g) => g.some(([k]) => k === kind));

  const { placeholder } = $settings(holder);

  const given =
    title?.getTextContent().trim() ||
    (kind === "dropdown" && typeof placeholder === "string" ? placeholder.trim() : "");

  const ids = $ssbIds();
  const fieldKey = $questionKey(holder);
  const fieldId = ids.fields.get(fieldKey);
  const options = group.filter($isOptionNode);
  const question = $native(holder).question;
  const host = $hostOf(node);

  const menu: BlockMenuModel = {
    kind,

    multi: $selectedBlocks().length > 1,
    followUp: $isOptionNode(node) && $canAddFollowUp(node),
    nested: host
      ? {
          host: host.getTextContent().trim() || ($isShowHideNode(host) ? "Details" : "Untitled"),
        }
      : undefined,
    header: $isInput(holder)
      ? {
          name: given || ownedField?.untitled || "Untitled",
          icon: ownedField
            ? (ownedField.icon ?? <TextAlignLeft />)
            : (kindIcon(kind) ?? <TextAlignLeft />),
        }
      : undefined,
    fieldId: fieldId && {
      ...fieldId,
      taken: [...ids.fields].flatMap(([key, value]) => (key !== fieldKey ? [value.id] : [])),
    },
    fieldArray: $isInput(holder) ? $fieldArrayMenu(holder) : undefined,
    errors: question
      ? nativeErrorMessages(question, {
          kind,
          label: title?.getTextContent() ?? "",
          optionCount: options.length,
        })
      : $isInput(holder)
        ? messagesFor(kind, $settings(holder), options.length, title?.getTextContent() ?? "")
        : [],
    optionValues: options.map((option) => {
      const native = $native(option).option;
      const legacy = ids.options.get(option.getKey())!;

      return {
        key: option.getKey(),
        label: option.getTextContent() || "Untitled",
        value: native ? native.value : legacy.id,
        pinned: native ? true : legacy.pinned,
        native: !!native,
      };
    }),
    settings: $settings(holder),
    hidden: $canHide(node) ? !!$settings(node).hidden : undefined,
    hint: ((hints) => (hints ? hints.length > 0 : undefined))($hintBlocks(node)),
    turnInto: turnGroup && {
      value: kind,
      options: turnGroup.map(([k, label]) => [k, label, kindIcon(k, !$isInput(holder))]),
    },
  };

  return {
    whole:
      $isQuestionNode(node) && group.length > 1
        ? "the question group"
        : $isOptionNode(node) && $nested(node).length
          ? "it and its follow-ups"
          : $isShowHideNode(node) && $nested(node).length
            ? "the Details block and what’s in it"
            : undefined,
    menu,
  };
}
