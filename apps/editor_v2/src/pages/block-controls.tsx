import type { BaseUIEvent } from "@base-ui/react/types";
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
  $createTextNode,
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
  INDENT_CONTENT_COMMAND,
  KEY_DOWN_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  type BaseSelection,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import {
  ArrowDown,
  ArrowUp,
  DotsSixVertical,
  MagnifyingGlass,
  Plus,
  TextIndent,
  TextOutdent,
  Trash,
  Table,
  ListBullets,
  ListNumbers,
} from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  $availableActions,
  $executeAction,
  rankActions,
  type EditorAction,
} from "../editor/core/actions";
import {
  BlockRail,
  DropLine,
  firstLineMiddle,
  menuKey,
  RailButton,
  railGrip,
  useBlockDrag,
  useRailTarget,
} from "../editor/react/block-rail";
import { useEditorDefinition, useLinkPages } from "../editor/react/composer";
import { $validPoint, roomierSide, useCaretReturn } from "../editor/react/editor-popup";
import { cn } from "../cn";
import { altKey } from "../editor/react/shortcut";
import { turnIntoOptions } from "../editor/react/turn-into";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { Menu } from "../ui/menu";
import { NativeSelect } from "../ui/native-select";
import { belowBar, Popover } from "../ui/popover";
import { groupLabel, listFooter } from "../ui/surface";
import { Tip } from "../ui/tooltip";
import { TurnIntoSubmenu } from "../ui/turn-into";
import { useLatched } from "../ui/use-latched";
import { actionList, PageActionList } from "./action-menu";
import { $writeAtEnd } from "./block-exit";
import { $blockLines, $pageChoices, $turnPageLines } from "./turn-into";
import { $rootBlock, type PagePlace } from "./insertion";
import { startWriting } from "./slash-menu";
import { PageMetadataNode } from "./metadata";
import { PageComponentNode, type PageComponentAttributes } from "./nodes";
import { $nearestPageList, $setPageListType } from "./modules/lists";
import { $changePageTableColumns } from "./modules/tables";
import { linkAddress } from "../editor/modules/links/url";
import { safePageUrl } from "./modules/text";
import { LinkPicker } from "../ui/link-picker";
import { $dropPageBlock, $pageDropAt, PAGE_BLOCK_DRAG } from "./block-drag";

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

type InsertMenu = {
  anchor: HTMLElement;
  /** The block it inserts beside, or null at the end of the page. */
  key: string | null;
  /** Where the new block goes beside its block. */
  place: PagePlace;
  selection: BaseSelection | null;
  side: "top" | "bottom";
};

type BlockMenu = { key: string; contextKey: string | null; selection: BaseSelection | null };

export function PageBlockControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const editable = useLexicalEditable();

  return editable ? <EditablePageControls anchor={anchor} hintId={hintId} /> : null;
}

function EditablePageControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const [editor] = useLexicalComposerContext();
  const [insert, setInsert] = useState<InsertMenu | null>(null);
  const [blockMenu, setBlockMenu] = useState<BlockMenu | null>(null);
  const caret = useRef<string | null>(null);
  const savedSelection = useRef<BaseSelection | null>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const returnCaret = useCaretReturn();
  // Add content opens the insert menu at the page's end; the rail's Insert, at its block
  const addContent = useId();
  const insertOpen = !!insert && insert.anchor.id !== addContent;
  // The block menu came from ⌘/: closing it lets the pointer lead the rail again
  const byKeyboard = useRef(false);

  const { target, pin, release } = useRailTarget(anchor, {
    // Keep the rail anchored while interacting with its menu.
    held: !!insert || !!blockMenu,
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
  });

  const drag = useBlockDrag(anchor, {
    type: PAGE_BLOCK_DRAG,
    $at: (key, point) => $pageDropAt(editor, anchor, key, point),
    $drop: $dropPageBlock,
    onEnd: release,
    onNudge: (key) => openBlockMenu(key, target?.key === key ? target.context : null),
  });

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
    setBlockMenu(null);
    setInsert({
      anchor: element,
      key,
      place,
      selection: savedSelection.current?.clone() ?? null,
      side: roomierSide(element.getBoundingClientRect()),
    });
  };

  const openBlockMenu = (key: string, contextKey: string | null = null) => {
    if (!editor.isEditable()) return;
    setInsert(null);
    setBlockMenu({ key, contextKey, selection: savedSelection.current?.clone() ?? null });
  };

  const closeBlockMenu = () => {
    setBlockMenu(null);

    if (!byKeyboard.current) return;
    byKeyboard.current = false;
    release();
  };

  // ⌘/ opens the caret's block menu, as in the form editor
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            !editor.isEditable() ||
            !(event.metaKey || event.ctrlKey) ||
            event.altKey ||
            event.key !== "/"
          )
            return false;
          const key = caret.current;

          if (!key || !grip.current) return false;
          event.preventDefault();
          byKeyboard.current = true;
          pin(key);
          openBlockMenu(key);

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    // openBlockMenu reads only refs and state setters
    [editor, pin],
  );

  return (
    <Menu.Root
      open={!!blockMenu}
      onOpenChange={(open, { reason }) => {
        if (open) {
          if (!blockMenu && target) openBlockMenu(target.key, target.context);

          return;
        }

        if (blockMenu && reason !== "item-press") returnCaret(blockMenu.selection, reason);
        closeBlockMenu();
      }}
    >
      <DropLine line={drag.line} />
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
          <Tip
            hint
            content={
              <>
                <em>Drag</em> to move
                <br />
                <em>Click</em> or <Kbd>{menuKey}</Kbd> for block options
              </>
            }
          >
            <Menu.Trigger
              render={
                <RailButton
                  ref={grip}
                  aria-label="Block options"
                  draggable
                  className={railGrip}
                  onDragStart={(event) => {
                    setBlockMenu(null);
                    drag.start(event, target.key);
                  }}
                  // Base UI opens a menu on mousedown, which would swallow the drag: it opens on click instead
                  onMouseDown={(event: BaseUIEvent<MouseEvent<HTMLButtonElement>>) =>
                    event.preventBaseUIHandler()
                  }
                  onClick={() => {
                    if (!blockMenu) return openBlockMenu(target.key, target.context);
                    returnCaret(blockMenu.selection, "trigger-press");
                    closeBlockMenu();
                  }}
                >
                  <DotsSixVertical />
                </RailButton>
              }
            />
          </Tip>
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
      <PageBlockMenu menu={blockMenu} onDone={closeBlockMenu} />
    </Menu.Root>
  );
}

/** Keeps the last menu state through its exit transition and fixes placement while filtering. */
function PageInsertMenu({
  menu,
  onDone,
  onDismiss,
}: {
  menu: InsertMenu | null;
  onDone: () => void;
  /** Esc, or a press outside. */
  onDismiss: (reason: string) => void;
}) {
  const shown = useLatched(menu);
  const search = useRef<HTMLInputElement>(null);

  return (
    <Popover.Root open={!!menu} onOpenChange={(open, { reason }) => !open && onDismiss(reason)}>
      {shown && (
        <Popover.Content
          aria-label="Insert page content"
          anchor={shown.anchor}
          side={shown.side}
          align="start"
          collisionPadding={belowBar()}
          collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
          // Focus before positioning must not scroll the page.
          initialFocus={() => {
            search.current?.focus({ preventScroll: true });

            return false;
          }}
          finalFocus={false}
          className="page-insert-menu flex w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 text-14"
        >
          <InsertList menu={shown} search={search} onDone={onDone} />
        </Popover.Content>
      )}
    </Popover.Root>
  );
}

/** The insert menu's search and list, fresh each time the menu opens. */
function InsertList({
  menu,
  search,
  onDone,
}: {
  menu: InsertMenu;
  search: RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string>();
  const ids = useId();
  const list = useRef<HTMLDivElement>(null);

  const actions = editor.getEditorState().read(
    () => {
      const target = menu.key ? $getNodeByKey(menu.key) : $getRoot().getLastChild();

      return target
        ? rankActions(
            query,
            $availableActions(editor, definition, { targetKey: target.getKey(), mode: menu.place }),
          )
        : [];
    },
    { editor },
  );

  const selected = actions[index];
  const shownIndex = useRef(index);

  // Scroll only after the highlight moves; the popup may not be positioned on its first render.
  useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    list.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const insert = (action: EditorAction) => {
    if (!editor.isEditable()) return;
    editor.update(
      () => {
        let target = menu.key ? $getNodeByKey(menu.key) : $getRoot().getLastChild();

        if (!target || target instanceof PageMetadataNode) {
          target = $createParagraphNode();
          $getRoot().append(target);
        }

        const result = $executeAction(editor, definition, action.id, {
          targetKey: target.getKey(),
          mode: menu.place,
        });

        if (result.executed) {
          onDone();
          result.result?.afterClose?.();
        } else setError(result.error ?? "This block cannot be inserted here.");
      },
      { tag: HISTORY_PUSH_TAG },
    );
    editor.focus();
  };

  return (
    <>
      <label className="mx-1.5 mt-1.5 flex items-center gap-2.5 border-b border-line px-2 pt-2.5 pb-3.5 text-muted [&>svg]:size-4 [&>svg]:shrink-0">
        <MagnifyingGlass aria-hidden="true" />
        <input
          ref={search}
          role="combobox"
          aria-label="Search page content"
          placeholder="Search content…"
          value={query}
          aria-expanded
          aria-controls={`${ids}-list`}
          aria-activedescendant={selected ? `${ids}-${index}` : undefined}
          className="w-full min-w-0 text-16 text-ink outline-offset-4"
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && actions.length) {
              event.preventDefault();
              setIndex(
                (current) =>
                  (current + (event.key === "ArrowDown" ? 1 : -1) + actions.length) %
                  actions.length,
              );
            } else if (event.key === "Enter" && selected) {
              event.preventDefault();
              insert(selected);
            }
          }}
        />
      </label>
      <div
        ref={list}
        id={`${ids}-list`}
        className={cn(actionList, "max-h-[34rem] min-h-0")}
        role="listbox"
        aria-label="Insert page content"
      >
        <PageActionList
          actions={actions}
          searching={!!query.trim()}
          selectedIndex={index}
          onHighlight={setIndex}
          onSelect={insert}
          optionId={(i) => `${ids}-${i}`}
          error={error}
        />
      </div>
      {selected?.description && (
        <p className={listFooter} aria-hidden="true">
          {selected.description}
        </p>
      )}
    </>
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

/** A row of the block menu: it acts, then closes the menu itself, so a failure can stay in view. */
function BlockMenuItem(props: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item closeOnClick={false} {...props} />;
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
      const list = $nearestPageList(node);
      let table = $isTableNode(block);
      // Turn into takes a whole text block: its line, a quote's lines or every item in a list
      const lines = block instanceof PageComponentNode ? null : $blockLines(block);

      while (node && !$isRootNode(node)) {
        if (!component && node instanceof PageComponentNode) component = node;

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
        { tag: HISTORY_PUSH_TAG, discrete: true },
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
      {(model.component || model.turnInto) && (
        <Menu.Group>
          {model.component && (
            <ComponentSettings
              key={model.component.key}
              component={model.component}
              onChange={(patch) =>
                change((block) => {
                  const node = $pageBlockDescendant(model.component!.key, block);

                  if (node instanceof PageComponentNode)
                    node.setAttributes({ ...node.getAttributes(), ...patch });
                }, false)
              }
            />
          )}
          {model.component &&
            (model.component.kind === "summary-list" ||
              model.component.kind === "summary-item") && (
              <BlockMenuItem
                icon={<Plus />}
                onClick={() =>
                  change((block) => {
                    if (!model.component) return;
                    const node = $pageBlockDescendant(model.component.key, block);

                    if (!(node instanceof PageComponentNode)) return;

                    const item = new PageComponentNode("summary-item", {
                      summaryKey: "Key",
                    }).append($createParagraphNode());

                    if (node.getKind() === "summary-list") node.append(item);
                    else node.insertAfter(item);
                    item.selectStart();
                  })
                }
              >
                Add summary item
              </BlockMenuItem>
            )}
          {model.component &&
            (model.component.kind === "action" || model.component.kind === "actions") && (
              <BlockMenuItem
                icon={<Plus />}
                onClick={() =>
                  change((block) => {
                    const node = $pageBlockDescendant(model.component!.key, block);

                    if (!(node instanceof PageComponentNode)) return;

                    const button = new PageComponentNode("action", {
                      href: "#",
                      variant: "secondary",
                    }).append($createTextNode("Get help"));

                    if (node.getKind() === "actions") node.append(button);
                    else node.insertAfter(button);
                    button.selectStart();
                  })
                }
              >
                Add another button
              </BlockMenuItem>
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

/** Action target fields are applied together; legacy Start destinations stay at the caret. */
function ComponentSettings({
  component,
  onChange,
}: {
  component: {
    key: string;
    kind: string;
    attributes: PageComponentAttributes;
  };
  onChange: (patch: PageComponentAttributes) => void;
}) {
  const data = component.attributes;
  const [label, setLabel] = useState(data.summary ?? data.caption ?? data.summaryKey ?? "");
  const [href, setHref] = useState(data.href ?? "");
  const [form, setForm] = useState(data.form ?? "");

  const [target, setTarget] = useState<"url" | "form" | "linked-form">(
    data.form !== undefined ? "form" : data.href !== undefined ? "url" : "linked-form",
  );

  const [error, setError] = useState<string>();
  const pages = useLinkPages();

  const labelName =
    component.kind === "details"
      ? "Details summary"
      : component.kind === "table"
        ? "Table caption"
        : component.kind === "summary-item"
          ? "Summary key"
          : undefined;

  if (!labelName && component.kind !== "action") return null;

  const keepSettings = () => {
    if (labelName) {
      if (!label.trim()) {
        setError(`Enter a ${labelName.toLowerCase()}.`);

        return;
      }

      if (label !== (data.summary ?? data.caption ?? data.summaryKey ?? ""))
        onChange(
          component.kind === "details"
            ? { summary: label }
            : component.kind === "table"
              ? { caption: label }
              : { summaryKey: label },
        );
    } else {
      const destination = target === "url" ? linkAddress(href, safePageUrl) : undefined;

      if (destination === null) {
        setError("Enter a relative link, or an http, https, email or telephone link.");

        return;
      }

      onChange({
        href: destination,
        form: target === "form" ? form : undefined,
        target: target === "linked-form" ? "form" : undefined,
      });

      if (destination) setHref(destination);
    }

    setError(undefined);
  };

  return (
    <form
      className="page-component-settings grid gap-4 px-3.5 pt-1 pb-3"
      onKeyDown={(event) => event.key !== "Escape" && event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        keepSettings();
      }}
    >
      {labelName ? (
        <Field size="sm" label={labelName} error={error}>
          <Input
            size="sm"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={keepSettings}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Keeping closes the menu and focuses the page, which would otherwise receive this Enter
              event.preventDefault();
              keepSettings();
            }}
          />
        </Field>
      ) : (
        <>
          <Field size="sm" label="Destination type">
            <NativeSelect
              size="sm"
              value={target}
              onChange={(event) => {
                const value = event.target.value;

                if (value === "url" || value === "form" || value === "linked-form")
                  setTarget(value);
              }}
            >
              <option value="url">Link</option>
              <option value="linked-form">Page's linked form</option>
              <option value="form">Registered form</option>
            </NativeSelect>
          </Field>
          {target === "url" && (
            <Field size="sm" label="Button destination">
              <LinkPicker size="sm" value={href} pages={pages} onValueChange={setHref} />
            </Field>
          )}
          {target === "form" && (
            <Field size="sm" label="Form identifier">
              <Input
                size="sm"
                value={form}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*"
                title="Use letters, numbers, hyphens or underscores; start with a letter or number."
                onChange={(event) => setForm(event.target.value)}
              />
            </Field>
          )}
          <Field size="sm" label="Button style">
            <NativeSelect
              size="sm"
              value={data.variant ?? "primary"}
              onChange={(event) => onChange({ variant: event.target.value })}
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </NativeSelect>
          </Field>
          {error && (
            <p className="text-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="secondary" className="justify-self-start">
            Apply settings
          </Button>
        </>
      )}
    </form>
  );
}
