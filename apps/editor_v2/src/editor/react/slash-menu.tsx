import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type TriggerFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $getNodeByKey,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_NORMAL,
  type NodeKey,
} from "lexical";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RowContent } from "../../ui/menu";
import { belowBar, Popover } from "../../ui/popover";
import { group, groupLabel, listEmpty, listFooter, row } from "../../ui/surface";
import {
  $availableActions,
  $executeAction,
  rankActions,
  sectioned,
  type EditorAction,
} from "../core/actions";
import { $turnLineInto } from "../core/turn-into";
import { $caretLine, registerLineHint } from "./block-dom";
import { useEditorDefinition } from "./composer";
import { roomierSide } from "./editor-popup";
import { useSlashTrigger } from "./slash-trigger";

// The top-level block holding the caret, where a chosen block goes
const $caretBlock = () => {
  const selection = $getSelection();

  return $isRangeSelection(selection) ? selection.anchor.getNode().getTopLevelElement() : null;
};

class BlockOption extends MenuOption {
  constructor(
    readonly entry: EditorAction,
    readonly targetKey: NodeKey,
  ) {
    super(entry.id);
  }
  get group() {
    return this.entry.group;
  }
}

/** Type "/" in an ordinary text line to filter blocks, navigate with arrows and insert with Enter. */
export function SlashMenu() {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const [query, setQuery] = useState<string | null>(null);
  // Picked as the menu opens and kept, so it shrinks towards the caret as you type instead of flipping over it
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const [error, setError] = useState<string>();

  // Where "/" opens this menu, the caret's empty line says so
  useEffect(
    () =>
      registerLineHint(editor, (focused) => {
        const line = focused ? $caretLine() : null;

        return $isParagraphNode(line) && $isRootNode(line.getParent())
          ? [line, "Start writing, or type / to add a block."]
          : null;
      }),
    [editor],
  );

  const slash = useSlashTrigger(
    useCallback(
      (query: string) => {
        const block = $caretBlock();

        return (
          !!block &&
          rankActions(
            query,
            $availableActions(editor, definition, { targetKey: block.getKey(), mode: "insert" }),
          ).length > 0
        );
      },
      [editor, definition],
    ),
  );

  const trigger = useCallback<TriggerFn>(
    (text, editor) => {
      const selection = $getSelection(); // runs inside the plugin's editor.read

      return $isRangeSelection(selection) &&
        $isParagraphNode(selection.anchor.getNode().getTopLevelElement())
        ? slash(text, editor)
        : null;
    },
    [slash],
  );

  const options = useMemo(
    () =>
      editor.getEditorState().read(
        () => {
          const block = $caretBlock();

          return block
            ? rankActions(
                query ?? "",
                $availableActions(editor, definition, {
                  targetKey: block.getKey(),
                  mode: "insert",
                }),
              ).map((entry) => new BlockOption(entry, block.getKey()))
            : [];
        },
        { editor },
      ),
    [editor, definition, query],
  );

  return (
    <LexicalTypeaheadMenuPlugin<BlockOption>
      options={options}
      triggerFn={trigger}
      onOpen={(resolution) => setSide(roomierSide(resolution.getRect()))}
      onQueryChange={(next) => {
        setQuery(next);
        setError(undefined);
      }}
      onClose={() => {
        setQuery(null);
        setError(undefined);
      }}
      anchorClassName="z-popup"
      // Above the editor's own arrow/Enter handling (COMMAND_PRIORITY_LOW), so an open menu always gets the keys
      commandPriority={COMMAND_PRIORITY_NORMAL}
      onSelectOption={(option, query, closeMenu) => {
        const queryKey = query?.getKey();
        const line = $getNodeByKey(option.targetKey);

        if (
          line &&
          $turnLineInto(definition, option.entry.id, line, query?.getTextContent() ?? "", () =>
            query?.remove(),
          )
        )
          return closeMenu();

        const outcome = $executeAction(
          editor,
          definition,
          option.entry.id,
          { targetKey: option.targetKey, mode: "insert" },
          () => {
            if (queryKey) $getNodeByKey(queryKey)?.remove();
          },
        );

        if (outcome.executed) {
          closeMenu();
          outcome.result?.afterClose?.();
        } else setError(outcome.error);
      }}
      menuRenderFn={(
        anchor,
        { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        const option = (entry: BlockOption, index: number) => (
          <div
            key={entry.key}
            id={`typeahead-item-${index}`}
            ref={entry.setRefElement}
            role="option"
            aria-label={entry.entry.title}
            aria-selected={selectedIndex === index}
            data-highlighted={selectedIndex === index ? "" : undefined}
            className={row}
            // Only a pointer that moves: one resting where the menu opens leaves Enter's choice alone
            onMouseMove={() => setHighlightedIndex(index)}
            onMouseDown={(e) => e.preventDefault()} // keep the caret (and the menu) in the editor
            onClick={() => selectOptionAndCleanUp(entry)}
          >
            <RowContent icon={entry.entry.icon} detail={entry.entry.markdown}>
              {entry.entry.title}
            </RowContent>
          </div>
        );

        const highlighted = selectedIndex === null ? undefined : options[selectedIndex]?.entry;

        return (
          anchor.current && (
            // Placed by the popover rather than where Lexical puts its anchor, so it stays on screen and clear of the
            // bar. The caret keeps the focus: typing and the arrow keys stay the editor's
            <Popover.Root open>
              <Popover.Content
                aria-label="Insert block"
                anchor={anchor.current}
                // Inside Lexical's anchor, which reads its options from there
                container={anchor.current}
                role="presentation"
                side={side}
                align="start"
                sideOffset={4}
                collisionPadding={belowBar()}
                collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
                initialFocus={false}
                finalFocus={false}
                className="flex max-h-[min(32.75rem,var(--available-height))] w-75 flex-col overflow-hidden p-0"
              >
                {/* Lexical points aria-activedescendant at the highlighted typeahead-item-N; this also says it aloud */}
                <p role="status" className="sr-only">
                  {highlighted?.title}
                </p>
                <div
                  role="listbox"
                  aria-label="Insert block"
                  className="group/popup min-h-0 overflow-y-auto overscroll-contain py-1"
                >
                  {error && (
                    <div role="alert" className="px-3.5 py-1.5 text-14 text-error">
                      {error}
                    </div>
                  )}
                  {options.length === 0 && <div className={listEmpty}>No results</div>}
                  {/* A search ranks one list; before it, the blocks are in their groups */}
                  {query
                    ? options.map(option)
                    : sectioned(options).map(({ group: heading, items }) => (
                        <div key={heading} className={group}>
                          <div className={groupLabel}>{heading}</div>
                          {items.map(({ item, index }) => option(item, index))}
                        </div>
                      ))}
                </div>
                {highlighted?.description && (
                  <p className={listFooter} aria-hidden="true">
                    {highlighted.description}
                  </p>
                )}
              </Popover.Content>
            </Popover.Root>
          )
        );
      }}
    />
  );
}
