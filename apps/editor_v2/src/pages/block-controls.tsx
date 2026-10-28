import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $isTableCellNode,
  $isTableSelection,
  $isTableNode,
  $insertTableRowAtSelection,
  $insertTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $deleteTableColumnAtSelection,
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
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  INDENT_CONTENT_COMMAND,
  KEY_DOWN_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  type BaseSelection,
  type LexicalNode,
  type PointType,
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
import { useEffect, useId, useRef, useState } from "react";
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
import { cn } from "../cn";
import { altKey } from "../editor/react/shortcut";
import { turnIntoOptions } from "../editor/react/turn-into";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { LinkPicker } from "../ui/link-picker";
import { NativeSelect } from "../ui/native-select";
import { Popover } from "../ui/popover";
import { group, groupLabel, listFooter } from "../ui/surface";
import { Tip } from "../ui/tooltip";
import { TurnIntoMenu } from "../ui/turn-into";
import { actionList, PageActionList, PageMenuRow } from "./action-menu";
import { $writeAtEnd } from "./block-exit";
import { $blockLines, $pageChoices, $turnPageLines } from "./turn-into";
import { $rootBlock, type PagePlace } from "./insertion";
import { $isPageContactNode, ContactBlockSettings } from "./modules/contact";
import { startWriting } from "./slash-menu";
import { PageMetadataNode } from "./metadata";
import { PageComponentNode } from "./nodes";
import { $nearestPageList, $setPageListType } from "./modules/lists";
import { normalizeLinkUrl } from "../editor/modules/links/url";
import { safePageUrl } from "./modules/text";
import { $dropPageBlock, $pageDropAt, PAGE_BLOCK_DRAG } from "./block-drag";

function $validPoint(point: PointType) {
  const node = $getNodeByKey(point.key);

  return (
    !!node?.isAttached() &&
    point.offset >= 0 &&
    (point.type === "text"
      ? $isTextNode(node) && point.offset <= node.getTextContentSize()
      : $isElementNode(node) && point.offset <= node.getChildrenSize())
  );
}

function $blockSelection(selection: BaseSelection | null, block: LexicalNode) {
  if (
    (!$isRangeSelection(selection) && !$isTableSelection(selection)) ||
    !$validPoint(selection.anchor) ||
    !$validPoint(selection.focus)
  )
    return null;

  if ($isTableSelection(selection))
    return selection.tableKey === block.getKey() && $isTableNode(block) ? selection : null;

  const anchor = $getNodeByKey(selection.anchor.key);

  return $rootBlock(anchor)?.getKey() === block.getKey() ? selection : null;
}

function $pageBlockDescendant(key: string | null, block: LexicalNode) {
  const node = key ? $getNodeByKey(key) : null;

  return node?.isAttached() && $rootBlock(node)?.is(block) ? node : null;
}

type OpenMenu = {
  kind: "insert" | "block";
  anchor: HTMLElement;
  key: string | null;
  contextKey: string | null;
  /** Where the insert menu's block goes beside its block. */
  place: PagePlace;
  selection: BaseSelection | null;
};

export function PageBlockControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const editable = useLexicalEditable();

  return editable ? <EditablePageControls anchor={anchor} hintId={hintId} /> : null;
}

function EditablePageControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const [editor] = useLexicalComposerContext();
  const [empty, setEmpty] = useState(false);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const caret = useRef<string | null>(null);
  const savedSelection = useRef<BaseSelection | null>(null);
  const grip = useRef<HTMLButtonElement>(null);
  // Add content opens the insert menu at the page's end; the rail's Insert, at its block
  const addContent = useId();
  const insertOpen = menu?.kind === "insert" && menu.anchor.id !== addContent;
  // The block menu came from ⌘/: closing it lets the pointer lead the rail again
  const byKeyboard = useRef(false);

  const { target, pin, release } = useRailTarget(anchor, {
    // Over the gutter or the rail, the rail stays with its block
    $blockAt: (element) =>
      editor.getRootElement()?.contains(element)
        ? ($rootBlock($getNearestNodeFromDOMNode(element))?.getKey() ?? null)
        : undefined,
    // The caret's block, kept while the selection is somewhere else for a moment
    $caretBlock: () => {
      const selection = $getSelection();
      const block = $isRangeSelection(selection) ? $rootBlock(selection.anchor.getNode()) : null;

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
  });

  useEffect(() => {
    const update = () =>
      editor.getEditorState().read(
        () => {
          const selection = $getSelection();

          if (selection) savedSelection.current = selection.clone();

          const content = $getRoot()
            .getChildren()
            .filter((node) => !(node instanceof PageMetadataNode));

          setEmpty(
            content.length === 1 &&
              content[0]?.getType() === "paragraph" &&
              !content[0].getTextContent(),
          );
        },
        { editor },
      );

    update();

    return editor.registerUpdateListener(update);
  }, [editor]);

  const open = (
    kind: OpenMenu["kind"],
    element: HTMLElement,
    key: string | null,
    contextKey: string | null = null,
    place: PagePlace = "below",
  ) => {
    if (!editor.isEditable()) return;
    setMenu({
      kind,
      anchor: element,
      key,
      contextKey,
      place,
      selection: savedSelection.current?.clone() ?? null,
    });
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
          open("block", grip.current, key);

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    // open reads only refs and state setters
    [editor, pin],
  );

  const close = () => {
    setMenu(null);

    if (!byKeyboard.current) return;
    byKeyboard.current = false;
    release();
  };

  return (
    <>
      <DropLine line={drag.line} />
      {/* An empty page shrinks to its first line (see PageEditor) */}
      <p id={hintId} data-empty-prompt={empty ? "" : undefined} className="sr-only">
        {startWriting}
      </p>
      {target && (
        // page-block-rail: the tests' hook
        <BlockRail target={target} className="page-block-rail w-(--page-gutter) pe-2 max-md:pe-1">
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
                open(
                  "insert",
                  event.currentTarget,
                  target.key,
                  null,
                  event.altKey ? "above" : "below",
                )
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
            <RailButton
              ref={grip}
              aria-label="Block options"
              aria-haspopup="dialog"
              aria-expanded={menu?.kind === "block"}
              draggable
              className={railGrip}
              onDragStart={(event) => {
                setMenu(null);
                drag.start(event, target.key);
              }}
              onClick={(event) => open("block", event.currentTarget, target.key, target.context)}
            >
              <DotsSixVertical />
            </RailButton>
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
        aria-expanded={menu?.kind === "insert" && !insertOpen}
        className="font-normal"
        icon={<Plus />}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => open("insert", event.currentTarget, null)}
      >
        Add content
      </Button>
      {menu?.kind === "insert" && <PageInsertMenu menu={menu} onClose={close} />}
      {menu?.kind === "block" && <PageBlockMenu menu={menu} onClose={close} />}
    </>
  );
}

function PageInsertMenu({ menu, onClose }: { menu: OpenMenu; onClose: () => void }) {
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
  useEffect(() => {
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
          onClose();
          result.result?.afterClose?.();
        } else setError(result.error ?? "This block cannot be inserted here.");
      },
      { tag: HISTORY_PUSH_TAG },
    );
    editor.focus();
  };

  return (
    <Popover.Root open onOpenChange={(value) => !value && onClose()}>
      <Popover.Content
        aria-label="Insert page content"
        anchor={menu.anchor}
        side="bottom"
        align="start"
        finalFocus={() => editor.getRootElement()}
        // Room for every block a page offers before a search, as far as the screen allows
        className="page-insert-menu flex w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 text-14"
      >
        <label className="mx-1.5 mt-1.5 flex items-center gap-2.5 border-b border-line px-2 pt-2.5 pb-3.5 text-muted [&>svg]:size-4 [&>svg]:shrink-0">
          <MagnifyingGlass aria-hidden="true" />
          <input
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
      </Popover.Content>
    </Popover.Root>
  );
}

function PageBlockMenu({ menu, onClose }: { menu: OpenMenu; onClose: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [error, setError] = useState<string>();

  const model = editor.getEditorState().read(
    () => {
      const block = menu.key && $getNodeByKey(menu.key);

      if (!block) return null;

      const selection = $blockSelection(menu.selection, block);

      let node: LexicalNode | null =
        $pageBlockDescendant(menu.contextKey, block) ??
        ($isRangeSelection(selection) ? $getNodeByKey(selection.anchor.key) : block);

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
        contact: $isPageContactNode(block) ? block.getSettings() : null,
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
          const block = menu.key && $getNodeByKey(menu.key);

          if (!block || block instanceof PageMetadataNode || !block.isAttached()) return;

          const selection = $blockSelection(menu.selection, block);

          if (selection) $setSelection(selection.clone());
          else if ($isElementNode(block)) block.selectStart();
          apply(block);
        },
        { tag: HISTORY_PUSH_TAG, discrete: true },
      );

      if (close) {
        onClose();
        editor.focus();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const table = (apply: () => void) =>
    change((block) => {
      const selection = $getSelection();

      if (
        !($isTableSelection(selection) && selection.tableKey === block.getKey()) &&
        (!$isRangeSelection(selection) ||
          $rootBlock(selection.anchor.getNode())?.getKey() !== block.getKey())
      ) {
        if ($isElementNode(block)) block.selectStart();
      }

      apply();
    });

  return (
    <Popover.Root open onOpenChange={(value) => !value && onClose()}>
      <Popover.Content
        aria-label="Block options"
        anchor={menu.anchor}
        side="bottom"
        align="start"
        finalFocus={() => editor.getRootElement()}
        className="page-block-menu max-h-[min(38rem,80dvh,var(--available-height))] w-[min(21rem,calc(100vw-2rem))] p-0 py-1 text-14"
      >
        <div className={groupLabel}>Block options</div>
        {error && (
          <p className="m-2 text-error" role="alert">
            {error}
          </p>
        )}
        {model.contact && (
          <ContactBlockSettings
            settings={model.contact}
            onChange={(patch) =>
              change((block) => {
                if ($isPageContactNode(block)) block.setSettings(patch);
              }, false)
            }
          />
        )}
        {model.component && (
          <ComponentSettings
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
          (model.component.kind === "action" || model.component.kind === "actions") && (
            <PageMenuRow
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
            </PageMenuRow>
          )}
        {model.turnInto && (
          <div className={group}>
            <TurnIntoMenu
              value={model.turnInto.value}
              options={turnIntoOptions(model.turnInto)}
              onValueChange={(value) =>
                change((block) => {
                  const lines = $blockLines(block);

                  if (lines) $turnPageLines(lines, value);
                })
              }
            />
          </div>
        )}
        {model.table && (
          <div className={group}>
            <PageMenuRow
              icon={<Table />}
              onClick={() =>
                table(() => {
                  $insertTableRowAtSelection(true);
                })
              }
            >
              Add row
            </PageMenuRow>
            <PageMenuRow
              icon={<Table />}
              onClick={() =>
                table(() => {
                  $insertTableColumnAtSelection(true);
                })
              }
            >
              Add column
            </PageMenuRow>
            <PageMenuRow onClick={() => table($deleteTableRowAtSelection)}>Delete row</PageMenuRow>
            <PageMenuRow onClick={() => table($deleteTableColumnAtSelection)}>
              Delete column
            </PageMenuRow>
          </div>
        )}
        {model.list && (
          <div className={group}>
            {model.list.type !== "bullet" && (
              <PageMenuRow
                icon={<ListBullets />}
                onClick={() =>
                  change((block) => {
                    $setPageListType($pageBlockDescendant(model.list!.key, block), "bullet");
                  })
                }
              >
                Change to bulleted list
              </PageMenuRow>
            )}
            {model.list.type !== "number" && (
              <PageMenuRow
                icon={<ListNumbers />}
                onClick={() =>
                  change((block) => {
                    $setPageListType($pageBlockDescendant(model.list!.key, block), "number");
                  })
                }
              >
                Change to numbered list
              </PageMenuRow>
            )}
            <PageMenuRow
              icon={<TextIndent />}
              onClick={() =>
                change(() => {
                  editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
                })
              }
            >
              Indent list
            </PageMenuRow>
            <PageMenuRow
              icon={<TextOutdent />}
              onClick={() =>
                change(() => {
                  editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
                })
              }
            >
              Outdent list
            </PageMenuRow>
          </div>
        )}
        <div className={group}>
          <PageMenuRow
            icon={<ArrowUp />}
            disabled={!model.up}
            onClick={() =>
              change((block) => {
                const previous = block.getPreviousSibling();

                if (previous && !(previous instanceof PageMetadataNode))
                  previous.insertBefore(block);
              })
            }
          >
            Move up
          </PageMenuRow>
          <PageMenuRow
            icon={<ArrowDown />}
            disabled={!model.down}
            onClick={() =>
              change((block) => {
                block.getNextSibling()?.insertAfter(block);
              })
            }
          >
            Move down
          </PageMenuRow>
          <PageMenuRow
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
          </PageMenuRow>
          <PageMenuRow
            icon={<Trash />}
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
          </PageMenuRow>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function ComponentSettings({
  component,
  onChange,
}: {
  component: {
    key: string;
    kind: string;
    attributes: { summary?: string; href?: string; variant?: string };
  };
  onChange: (patch: { summary?: string; href?: string; variant?: string }) => void;
}) {
  const [summary, setSummary] = useState(component.attributes.summary ?? "");
  const [href, setHref] = useState(component.attributes.href ?? "");
  const [variant, setVariant] = useState(component.attributes.variant ?? "primary");
  const [error, setError] = useState<string>();
  const pages = useLinkPages();

  if (!["details", "start", "action"].includes(component.kind)) return null;

  return (
    <form
      className="page-component-settings grid gap-4 border-b border-line px-3.5 pt-2 pb-4"
      onSubmit={(event) => {
        event.preventDefault();

        const destination = normalizeLinkUrl(href);

        if (!safePageUrl(destination)) {
          setError("Enter a relative link, or an http, https, email or telephone link.");

          return;
        }

        if (component.kind === "details" && !summary.trim()) {
          setError("Enter a details summary.");

          return;
        }

        onChange(
          component.kind === "details"
            ? { summary }
            : {
                href: destination || (component.kind === "start" ? undefined : "#"),
                ...(component.kind === "action" && { variant }),
              },
        );
        setHref(destination);
        setError(undefined);
      }}
    >
      {component.kind === "details" ? (
        <Field size="sm" label="Details summary">
          <Input size="sm" value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
      ) : (
        <>
          <Field size="sm" label="Button destination">
            <LinkPicker
              size="sm"
              value={href}
              pages={pages}
              placeholder={component.kind === "start" ? "Use linked form" : undefined}
              onValueChange={setHref}
            />
          </Field>
          {component.kind === "action" && (
            <Field size="sm" label="Button style">
              <NativeSelect
                size="sm"
                value={variant}
                onChange={(event) => setVariant(event.target.value)}
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </NativeSelect>
            </Field>
          )}
        </>
      )}
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="justify-self-start">
        Apply settings
      </Button>
    </form>
  );
}
