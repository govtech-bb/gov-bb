import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $isTableCellNode,
  $isTableSelection,
  $isTableNode,
  $insertTableRowAtSelection,
  $deleteTableRowAtSelection,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  SKIP_SELECTION_FOCUS_TAG,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  type BaseSelection,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  TextIndent,
  TextOutdent,
  Trash,
  Table,
  ListBullets,
  ListNumbers,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import {
  BlockRail,
  DropLine,
  firstLineMiddle,
  menuKey,
  RailButton,
  useBlockControls,
  BlockMenuRoot,
  BlockGrip,
  EditorSlot,
  $validPoint,
  roomierSide,
  useCaretReturn,
  altKey,
  turnIntoOptions,
} from "@/editor/react";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Menu } from "../ui/menu";
import { belowBar } from "../ui/popover";
import { groupLabel } from "../ui/surface";
import { Tip } from "../ui/tooltip";
import { TurnIntoSubmenu } from "../ui/turn-into";
import { useLatched } from "../ui/use-latched";
import { PageInsertMenu, type PageInsertMenuState } from "./insert-menu";
import { $writeAtEnd } from "./block-exit";
import { $blockLines, $pageChoices, $turnPageLines } from "./turn-into";
import { $rootBlock, type PagePlace } from "./insertion";
import { OPEN_BLOCK_OPTIONS_COMMAND } from "./block-options";
import { $isPageContactNode, ContactBlockSettings, type PageContactNode } from "./modules/contact";
import { startWriting } from "./slash-menu";
import { PageMetadataNode } from "./metadata";
import { PageComponentNode } from "./blocks/node";
import { $nearestPageList, $setPageListType } from "./modules/lists";
import { $changePageTableColumns } from "./modules/tables";
import { $dropPageBlock, $pageDropAt, PAGE_BLOCK_DRAG } from "./block-drag";
import { BLOCK_OPTIONS, BlockMenuItem, type BlockOptionsProps } from "./blocks/block-options";

function $blockSelection(selection: BaseSelection | null, block: LexicalNode) {
  if (
    (!$isRangeSelection(selection) && !$isTableSelection(selection)) ||
    !$validPoint(selection.anchor) ||
    !$validPoint(selection.focus)
  )
    return null;

  if ($isTableSelection(selection)) {
    const table = $getNodeByKey(selection.tableKey);

    return $isTableNode(table) && $rootBlock(table)?.is(block) ? selection : null;
  }

  const anchor = $getNodeByKey(selection.anchor.key);

  return $rootBlock(anchor)?.getKey() === block.getKey() ? selection : null;
}

function $pageBlockDescendant(key: string | null, block: LexicalNode) {
  const node = key ? $getNodeByKey(key) : null;

  return node?.isAttached() && $rootBlock(node)?.is(block) ? node : null;
}

/** Assigns gaps between blocks to their nearest block, keeping the rail reachable through the gutter. */
function $pageBlockAt(editor: LexicalEditor, y: number) {
  const blocks = $getRoot()
    .getChildren()
    .flatMap((node) => {
      const element =
        node instanceof PageMetadataNode ? null : editor.getElementByKey(node.getKey());

      return element?.getClientRects().length
        ? [{ key: node.getKey(), box: element.getBoundingClientRect() }]
        : [];
    });

  if (!blocks.length || y < blocks[0]!.box.top || y > blocks.at(-1)!.box.bottom) return null;

  return blocks.find(({ box }, index) => {
    const next = blocks[index + 1];

    return !next || y < (box.bottom + next.box.top) / 2;
  })!.key;
}

type BlockMenu = { key: string; contextKey: string | null; selection: BaseSelection | null };

export function PageBlockControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const editable = useLexicalEditable();

  return editable ? <EditablePageControls anchor={anchor} hintId={hintId} /> : null;
}

function EditablePageControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const [editor] = useLexicalComposerContext();
  const [insert, setInsert] = useState<PageInsertMenuState | null>(null);
  const caret = useRef<string | null>(null);
  const savedSelection = useRef<BaseSelection | null>(null);
  // Where the caret was as the block menu opened, for closing it to put the caret back
  const menuSelection = useRef<BaseSelection | null>(null);
  const returnCaret = useCaretReturn();
  // Add content opens the insert menu at the page's end; the rail's Insert, at its block
  const addContent = useId();
  const insertOpen = !!insert && insert.anchor.id !== addContent;

  const controls = useBlockControls(anchor, {
    // Keep the rail anchored while interacting with its insert menu, as with its block menu
    held: !!insert,
    target: {
      $blockAt: (element, point) => {
        const root = editor.getRootElement();

        if (!root) return undefined;
        const block = root.contains(element) && $rootBlock($getNearestNodeFromDOMNode(element));

        if (block) return block.getKey();

        return root.contains(element) || element === anchor
          ? $pageBlockAt(editor, point.y + anchor.getBoundingClientRect().top)
          : undefined;
      },
      // The caret's block, kept while the selection is somewhere else for a moment
      $caretBlock: () => {
        const selection = $getSelection();

        const block =
          $isRangeSelection(selection) || $isTableSelection(selection)
            ? $rootBlock(selection.anchor.getNode())
            : null;

        if (block) caret.current = block.getKey();

        return caret.current && $getNodeByKey(caret.current)?.isAttached() ? caret.current : null;
      },
      $place: (key) => firstLineMiddle(editor, anchor, key),
    },
    drag: {
      type: PAGE_BLOCK_DRAG,
      $at: (key, point) => $pageDropAt(editor, anchor, key, point),
      $drop: $dropPageBlock,
    },
    onMenuOpen: () => {
      setInsert(null);
      menuSelection.current = savedSelection.current?.clone() ?? null;
    },
    // Esc, a press outside or the grip again puts the caret back; an option's own action places it
    onMenuClose: (reason) => {
      if (reason && reason !== "item-press") returnCaret(menuSelection.current, reason);
    },
  });

  const { target, menu, openMenu } = controls;

  useEffect(() => {
    const update = () =>
      editor.getEditorState().read(
        () => {
          const selection = $getSelection();

          if (selection) savedSelection.current = selection.clone();
        },
        { editor },
      );

    update();

    return editor.registerUpdateListener(update);
  }, [editor]);

  const openInsert = (element: HTMLElement, key: string | null, place: PagePlace = "below") => {
    if (!editor.isEditable()) return;

    if (menu) controls.closeMenu();
    setInsert({
      anchor: element,
      key,
      place,
      selection: savedSelection.current?.clone() ?? null,
      side: roomierSide(element.getBoundingClientRect()),
    });
  };

  const blockMenu: BlockMenu | null = menu && {
    key: menu.key,
    contextKey: menu.context,
    selection: menuSelection.current,
  };

  // A block that still needs setting up opens its own Block options, such as a contact block once it's inserted
  useEffect(
    () =>
      editor.registerCommand(
        OPEN_BLOCK_OPTIONS_COMMAND,
        (key) => {
          if (!editor.isEditable()) return false;

          // Its root block takes the rail, which renders for it if no pointer or caret has put it anywhere yet; the
          // block itself, such as a contact inside a notice, stays the menu's subject
          const root = editor.getEditorState().read(() => $rootBlock($getNodeByKey(key))?.getKey());

          if (!root) return false;
          // Pinned, the menu stays on its block; closing it lets the pointer lead the rail again
          openMenu(root, key, { pin: true });

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, openMenu],
  );

  return (
    <BlockMenuRoot controls={controls}>
      <DropLine line={controls.drag.line} />
      <p id={hintId} className="sr-only">
        {startWriting}
      </p>
      {target && (
        // page-block-rail: the tests' hook
        <BlockRail
          target={target}
          className="page-block-rail w-(--page-gutter) pe-4 max-md:pe-3 max-sm:pe-1"
        >
          <Tip
            hint
            content={
              <>
                <em>Click</em> to add content below
                <br />
                <em>{altKey}-click</em> to add it above
              </>
            }
          >
            <RailButton
              aria-label="Insert page content"
              aria-haspopup="dialog"
              aria-expanded={insertOpen}
              className="[&>svg]:size-4.5"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) =>
                openInsert(event.currentTarget, target.key, event.altKey ? "above" : "below")
              }
            >
              <Plus />
            </RailButton>
          </Tip>
          <BlockGrip
            controls={controls}
            label="Block options"
            tip={
              <>
                <em>Drag</em> to move
                <br />
                <em>Click</em> or <Kbd>{menuKey}</Kbd> for block options
              </>
            }
          />
        </BlockRail>
      )}
      {/* Below the last block, a click goes on writing at the end of the page */}
      <div
        aria-hidden="true"
        className="h-6 cursor-text"
        onMouseDown={(event) => {
          if (event.button !== 0 || !editor.isEditable()) return;
          event.preventDefault();
          editor.update($writeAtEnd);
          editor.focus();
        }}
      />
      <Button
        id={addContent}
        aria-haspopup="dialog"
        aria-expanded={!!insert && !insertOpen}
        className="font-normal"
        icon={<Plus />}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => openInsert(event.currentTarget, null)}
      >
        Add content
      </Button>
      <PageInsertMenu
        menu={insert}
        onDone={() => setInsert(null)}
        onDismiss={(reason) => {
          if (insert) returnCaret(insert.selection, reason);
          setInsert(null);
        }}
      />
      <PageBlockMenu menu={blockMenu} onDone={() => controls.closeMenu()} />
    </BlockMenuRoot>
  );
}

/** Keeps the last block's menu content through its exit transition. */
function PageBlockMenu({ menu, onDone }: { menu: BlockMenu | null; onDone: () => void }) {
  const shown = useLatched(menu);

  return (
    <Menu.Content
      aria-label="Block options"
      side="bottom"
      collisionPadding={belowBar()}
      finalFocus={false}
      className="page-block-menu w-[min(21rem,calc(100vw-2rem))]"
    >
      {shown && <BlockMenuRows menu={shown} onDone={onDone} />}
    </Menu.Content>
  );
}

function BlockMenuRows({ menu, onDone }: { menu: BlockMenu; onDone: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [error, setError] = useState<string>();

  const model = editor.getEditorState().read(
    () => {
      const block = $getNodeByKey(menu.key);

      if (!block) return null;

      const selection = $blockSelection(menu.selection, block);

      let node: LexicalNode | null =
        $pageBlockDescendant(menu.contextKey, block) ??
        ($isRangeSelection(selection) || $isTableSelection(selection)
          ? $getNodeByKey(selection.anchor.key)
          : block);

      let component: PageComponentNode | null = null;
      let contact: PageContactNode | null = null;
      const list = $nearestPageList(node);
      let table = $isTableNode(block);
      // Turn into takes a whole text block: its line, a quote's lines or every item in a list
      const lines = block instanceof PageComponentNode ? null : $blockLines(block);

      while (node && !$isRootNode(node)) {
        // The innermost wins: a contact inside a notice is the contact's to set up
        if (!component && !contact && $isPageContactNode(node)) contact = node;

        if (!component && !contact && node instanceof PageComponentNode) component = node;

        if ($isTableCellNode(node)) table = true;
        node = node.getParent();
      }

      return {
        list: list ? { key: list.getKey(), type: list.getListType() } : null,
        table,
        up:
          !!block.getPreviousSibling() && !(block.getPreviousSibling() instanceof PageMetadataNode),
        down: !!block.getNextSibling(),
        turnInto: lines?.length ? $pageChoices(lines) : null,
        contact: contact ? { key: contact.getKey(), settings: contact.getSettings() } : null,
        component: component
          ? {
              key: component.getKey(),
              kind: component.getKind(),
              attributes: component.getAttributes(),
            }
          : null,
      };
    },
    { editor },
  );

  if (!model) return null;
  const { component } = model;

  const change = (apply: (block: LexicalNode) => void, close = true) => {
    if (!editor.isEditable()) return;

    try {
      editor.update(
        () => {
          const block = $getNodeByKey(menu.key);

          if (!block || block instanceof PageMetadataNode || !block.isAttached()) return;

          const selection = $blockSelection(menu.selection, block);

          if (selection) $setSelection(selection.clone());
          else if ($isElementNode(block)) block.selectStart();
          apply(block);
        },
        // Kept open, the menu's own control keeps the focus while the block changes
        {
          tag: close ? HISTORY_PUSH_TAG : [HISTORY_PUSH_TAG, SKIP_SELECTION_FOCUS_TAG],
          discrete: true,
        },
      );

      if (close) {
        onDone();
        editor.focus();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <>
      <div className={groupLabel} aria-hidden="true">
        Block options
      </div>
      {error && (
        <p className="px-3.5 py-1.5 text-14 text-error" role="alert">
          {error}
        </p>
      )}
      {model.contact && (
        // Keep its fields' keys out of menu navigation; Escape still dismisses it.
        <div onKeyDown={(event) => event.key !== "Escape" && event.stopPropagation()}>
          <ContactBlockSettings
            settings={model.contact.settings}
            onChange={(patch) =>
              change((block) => {
                const node = $pageBlockDescendant(model.contact!.key, block);

                if ($isPageContactNode(node)) node.setSettings(patch);
              }, false)
            }
          />
        </div>
      )}
      {(component || model.turnInto) && (
        <Menu.Group>
          {/* The component's own options, from the module that owns its kind; another component's start afresh */}
          {component && (
            <EditorSlot<BlockOptionsProps>
              key={component.key}
              name={BLOCK_OPTIONS}
              props={{
                component,
                change: (apply, close) =>
                  change((block) => {
                    const node = $pageBlockDescendant(component.key, block);

                    if (node instanceof PageComponentNode) apply(node);
                  }, close),
              }}
            />
          )}
          {model.turnInto && (
            <TurnIntoSubmenu
              value={model.turnInto.value}
              options={turnIntoOptions(model.turnInto)}
              onValueChange={(value) =>
                change((block) => {
                  const lines = $blockLines(block);

                  if (lines) $turnPageLines(lines, value);
                })
              }
            />
          )}
        </Menu.Group>
      )}
      {model.table && (
        <Menu.Group>
          <BlockMenuItem
            icon={<Table />}
            onClick={() =>
              change(() => {
                $insertTableRowAtSelection(true);
              })
            }
          >
            Add row
          </BlockMenuItem>
          <BlockMenuItem
            icon={<Table />}
            onClick={() => change(() => $changePageTableColumns("insert"))}
          >
            Add column
          </BlockMenuItem>
          <BlockMenuItem onClick={() => change($deleteTableRowAtSelection)}>
            Delete row
          </BlockMenuItem>
          <BlockMenuItem onClick={() => change(() => $changePageTableColumns("delete"))}>
            Delete column
          </BlockMenuItem>
        </Menu.Group>
      )}
      {model.list && (
        <Menu.Group>
          {model.list.type !== "bullet" && (
            <BlockMenuItem
              icon={<ListBullets />}
              onClick={() =>
                change((block) => {
                  $setPageListType($pageBlockDescendant(model.list!.key, block), "bullet");
                })
              }
            >
              Change to bulleted list
            </BlockMenuItem>
          )}
          {model.list.type !== "number" && (
            <BlockMenuItem
              icon={<ListNumbers />}
              onClick={() =>
                change((block) => {
                  $setPageListType($pageBlockDescendant(model.list!.key, block), "number");
                })
              }
            >
              Change to numbered list
            </BlockMenuItem>
          )}
          <BlockMenuItem
            icon={<TextIndent />}
            onClick={() =>
              change(() => {
                editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
              })
            }
          >
            Indent list
          </BlockMenuItem>
          <BlockMenuItem
            icon={<TextOutdent />}
            onClick={() =>
              change(() => {
                editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
              })
            }
          >
            Outdent list
          </BlockMenuItem>
        </Menu.Group>
      )}
      <Menu.Group>
        <BlockMenuItem
          icon={<ArrowUp />}
          disabled={!model.up}
          onClick={() =>
            change((block) => {
              const previous = block.getPreviousSibling();

              if (previous && !(previous instanceof PageMetadataNode)) previous.insertBefore(block);
            })
          }
        >
          Move up
        </BlockMenuItem>
        <BlockMenuItem
          icon={<ArrowDown />}
          disabled={!model.down}
          onClick={() =>
            change((block) => {
              block.getNextSibling()?.insertAfter(block);
            })
          }
        >
          Move down
        </BlockMenuItem>
        <BlockMenuItem
          icon={<Plus />}
          onClick={() =>
            change((block) => {
              const paragraph = $createParagraphNode();
              block.insertAfter(paragraph);
              paragraph.select();
            })
          }
        >
          Add text after block
        </BlockMenuItem>
      </Menu.Group>
      <Menu.Group>
        <BlockMenuItem
          icon={<Trash />}
          variant="danger"
          onClick={() =>
            change((block) => {
              const next = block.getNextSibling();
              const previous = block.getPreviousSibling();
              block.remove();
              const target = next ?? (previous instanceof PageMetadataNode ? null : previous);

              if ($isElementNode(target)) target.selectEnd();
              else {
                const paragraph = $createParagraphNode();
                $getRoot().append(paragraph);
                paragraph.select();
              }
            })
          }
        >
          Delete block
        </BlockMenuItem>
      </Menu.Group>
    </>
  );
}
