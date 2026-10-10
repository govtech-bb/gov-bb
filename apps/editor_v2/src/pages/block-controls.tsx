import { Popover } from "@base-ui/react/popover";
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
  HISTORY_PUSH_TAG,
  INDENT_CONTENT_COMMAND,
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
  matchesAction,
  type EditorAction,
} from "../editor/core/actions";
import { useEditorDefinition } from "../editor/react/composer";
import { Button, blockHandle } from "../ui/button";
import { compactInput } from "../ui/input";
import { panel } from "../ui/select";
import { Tip } from "../ui/tooltip";
import { PageActionList, PageMenuRow } from "./action-menu";
import { $pageInsertionTarget } from "./insertion";
import { PageMetadataNode } from "./metadata";
import { PageComponentNode } from "./nodes";
import { $nearestPageList, $setPageListType } from "./modules/lists";
import { safePageUrl } from "./modules/text";
import { usePageBlockDrag } from "./block-drag";

function $rootBlock(node: LexicalNode | null): LexicalNode | null {
  while (node?.getParent() && !$isRootNode(node.getParent())) node = node.getParent();

  return node && !$isRootNode(node) && !(node instanceof PageMetadataNode) ? node : null;
}

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

type Rail = { key: string; top: number };

type OpenMenu = {
  kind: "insert" | "block";
  anchor: HTMLElement;
  key: string | null;
  contextKey: string | null;
  selection: BaseSelection | null;
};

export function PageBlockControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const editable = useLexicalEditable();

  return editable ? <EditablePageControls anchor={anchor} hintId={hintId} /> : null;
}

function EditablePageControls({ anchor, hintId }: { anchor: HTMLElement; hintId: string }) {
  const [editor] = useLexicalComposerContext();
  const drag = usePageBlockDrag(anchor);
  const [rail, setRail] = useState<Rail | null>(null);
  const [empty, setEmpty] = useState(false);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const hovered = useRef<string | null>(null);
  const hoveredContext = useRef<string | null>(null);
  const caret = useRef<string | null>(null);
  const savedSelection = useRef<BaseSelection | null>(null);

  useEffect(() => {
    const measure = () => {
      const key = hovered.current ?? caret.current;
      const element = key && editor.getElementByKey(key);
      let next: Rail | null = null;

      if (element && element.getClientRects().length) {
        const style = getComputedStyle(element);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

        next = {
          key,
          top:
            element.getBoundingClientRect().top -
            anchor.getBoundingClientRect().top +
            parseFloat(style.borderTopWidth) +
            parseFloat(style.paddingTop) +
            lineHeight / 2,
        };
      }

      setRail((previous) =>
        previous?.key === next?.key && previous?.top === next?.top ? previous : next,
      );
    };

    const update = () => {
      editor.getEditorState().read(
        () => {
          const selection = $getSelection();

          if (selection) savedSelection.current = selection.clone();

          const block = $isRangeSelection(selection)
            ? $rootBlock(selection.anchor.getNode())
            : null;

          if (block) caret.current = block.getKey();

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
      measure();
    };

    const onMove = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node) || !editor.getRootElement()?.contains(target)) return;
      editor.getEditorState().read(
        () => {
          const node = $getNearestNodeFromDOMNode(target);
          const block = $rootBlock(node);
          const previous = hoveredContext.current ? $getNodeByKey(hoveredContext.current) : null;
          hovered.current = block?.getKey() ?? null;

          // Crossing ancestor padding to the root rail must retain the nested settings target.
          if (!node || !previous?.isAttached() || !node.isParentOf(previous))
            hoveredContext.current = block ? (node?.getKey() ?? null) : null;
        },
        { editor },
      );
      measure();
    };

    const onLeave = () => {
      hovered.current = null;
      hoveredContext.current = null;
      measure();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    anchor.addEventListener("pointermove", onMove);
    anchor.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", measure);
    const unregister = editor.registerUpdateListener(update);
    update();

    return () => {
      unregister();
      observer.disconnect();
      anchor.removeEventListener("pointermove", onMove);
      anchor.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", measure);
    };
  }, [editor, anchor]);

  const open = (kind: OpenMenu["kind"], element: HTMLElement, key: string | null) => {
    if (!editor.isEditable()) return;
    let target = key;

    if (kind === "insert" && key === caret.current) {
      editor.getEditorState().read(
        () => {
          target = $pageInsertionTarget()?.getKey() ?? key;
        },
        { editor },
      );
    }

    setMenu({
      kind,
      anchor: element,
      key: target,
      contextKey: kind === "block" ? hoveredContext.current : null,
      selection: savedSelection.current?.clone() ?? null,
    });
  };

  return (
    <>
      {drag.hit && <div className="page-drop-line" style={drag.hit.line} aria-hidden="true" />}
      <p id={hintId} className={empty ? "page-empty-prompt" : "sr-only"}>
        Start writing, or type / to add content.
      </p>
      {rail && (
        <div className="page-block-rail" style={{ top: rail.top }}>
          <Tip content="Insert page content">
            <button
              type="button"
              className={`${blockHandle} page-rail-button w-6 [&>svg]:size-4.5`}
              aria-label="Insert page content"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => open("insert", event.currentTarget, rail.key)}
            >
              <Plus />
            </button>
          </Tip>
          <Tip content="Drag to move, or click for block options">
            <button
              type="button"
              className={`${blockHandle} page-rail-button page-drag-handle w-6 [&>svg]:w-4.25`}
              aria-label="Block options"
              draggable
              onDragStart={(event) => {
                setMenu(null);
                drag.start(event, rail.key);
              }}
              onDragEnd={drag.finish}
              onClick={(event) => open("block", event.currentTarget, rail.key)}
            >
              <DotsSixVertical />
            </button>
          </Tip>
        </div>
      )}
      <Button
        className="page-add-content"
        icon={<Plus />}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => open("insert", event.currentTarget, null)}
      >
        Add content
      </Button>
      {menu?.kind === "insert" && <PageInsertMenu menu={menu} onClose={() => setMenu(null)} />}
      {menu?.kind === "block" && <PageBlockMenu menu={menu} onClose={() => setMenu(null)} />}
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
        ? $availableActions(editor, definition, { targetKey: target.getKey() }).filter((action) =>
            matchesAction(action, query),
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
      <Popover.Portal>
        <Popover.Positioner
          anchor={menu.anchor}
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Popover.Popup
            className={`page-insert-menu ${panel}`}
            finalFocus={() => editor.getRootElement()}
          >
            <label className="page-menu-search">
              <MagnifyingGlass aria-hidden="true" />
              <input
                role="combobox"
                aria-label="Search page content"
                placeholder="Search content…"
                value={query}
                aria-expanded
                aria-controls={`${ids}-list`}
                aria-activedescendant={selected ? `${ids}-${index}` : undefined}
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
              className="page-action-list"
              role="listbox"
              aria-label="Insert page content"
            >
              <PageActionList
                actions={actions}
                selectedIndex={index}
                onHighlight={setIndex}
                onSelect={insert}
                optionId={(i) => `${ids}-${i}`}
                error={error}
              />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
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
      <Popover.Portal>
        <Popover.Positioner
          anchor={menu.anchor}
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 outline-none"
        >
          <Popover.Popup
            className={`page-block-menu ${panel}`}
            finalFocus={() => editor.getRootElement()}
          >
            <div className="page-block-menu-title">Block options</div>
            {error && (
              <p className="page-menu-error" role="alert">
                {error}
              </p>
            )}
            {model.component && (
              <ComponentSettings
                component={model.component}
                onChange={(patch) =>
                  change(() => {
                    const node = $getNodeByKey(model.component!.key);

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
                    change(() => {
                      const node = $getNodeByKey(model.component!.key);

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
            {model.table && (
              <div className="page-menu-section">
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
                <PageMenuRow onClick={() => table($deleteTableRowAtSelection)}>
                  Delete row
                </PageMenuRow>
                <PageMenuRow onClick={() => table($deleteTableColumnAtSelection)}>
                  Delete column
                </PageMenuRow>
              </div>
            )}
            {model.list && (
              <div className="page-menu-section">
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
            <div className="page-menu-section">
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
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

  if (!["details", "start", "action"].includes(component.kind)) return null;

  return (
    <form
      className="page-component-settings"
      onSubmit={(event) => {
        event.preventDefault();

        if (!safePageUrl(href)) {
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
                href: href || (component.kind === "start" ? undefined : "#"),
                ...(component.kind === "action" && { variant }),
              },
        );
        setError(undefined);
      }}
    >
      {component.kind === "details" ? (
        <label>
          Details summary
          <input
            className={compactInput}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
      ) : (
        <>
          <label>
            Button destination
            <input
              className={compactInput}
              type="text"
              value={href}
              placeholder={component.kind === "start" ? "Use linked form" : "/next-page"}
              onChange={(event) => setHref(event.target.value)}
            />
          </label>
          {component.kind === "action" && (
            <label>
              Button style
              <select
                className={compactInput}
                value={variant}
                onChange={(event) => setVariant(event.target.value)}
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </label>
          )}
        </>
      )}
      {error && (
        <p className="page-menu-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary">
        Apply settings
      </Button>
    </form>
  );
}
