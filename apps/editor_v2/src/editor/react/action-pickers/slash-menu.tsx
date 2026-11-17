import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $getNodeByKey,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_NORMAL,
  type ElementNode,
  type NodeKey,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/cn";
import { belowBar, Popover } from "@/ui/popover";
import { instant } from "@/ui/surface";
import {
  $availableActions,
  $executeAction,
  rankActions,
  type EditorAction,
} from "../../core/actions";
import { $turnLineInto } from "../../core/turn-into";
import { $caretLine, registerLineHint } from "../block-dom";
import { useEditorDefinition } from "../composer";
import { roomierSide } from "../editor-popup";
import { ActionDescription, ActionList, actionListBox, cannotInsert } from "./action-list";
import { useSlashTrigger } from "./slash-trigger";

type SlashMenuProps = {
  /**
   * Where a chosen block goes, from the caret, or null where "/" is only a slash. It runs in the editor's read. By
   * default it's the caret's line when that's a paragraph at the top of the document.
   */
  $target?: () => ElementNode | null;
  /** The hint on the caret's empty line, that "/" opens the menu there (see registerLineHint). */
  $hint?: (focused: boolean) => readonly [line: ElementNode, words: string] | null;
  /** Names the list for screen readers. */
  label?: string;
  /** What the menu says when a search finds nothing. */
  empty?: string;
  className?: string;
};

function $topLevelParagraph() {
  const selection = $getSelection();

  const block = $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()
    : null;

  return $isParagraphNode(block) ? block : null;
}

function $topLevelParagraphHint(focused: boolean) {
  const line = focused ? $caretLine() : null;

  return $isParagraphNode(line) && $isRootNode(line.getParent())
    ? ([line, "Start writing, or type / to add a block."] as const)
    : null;
}

class SlashOption extends MenuOption {
  constructor(
    readonly action: EditorAction,
    readonly targetKey: NodeKey,
  ) {
    super(action.id);
  }
}

/**
 * Type "/" to search the blocks that can go where the caret is, move through them with the arrow keys and insert one
 * with Enter. An editor says where "/" opens the menu and what its empty lines say about it.
 */
export function SlashMenu(props: SlashMenuProps) {
  const editable = useLexicalEditable();

  return editable ? <EditableSlashMenu {...props} /> : null;
}

function EditableSlashMenu({
  $target = $topLevelParagraph,
  $hint = $topLevelParagraphHint,
  label = "Insert block",
  empty = "No blocks match your search.",
  className,
}: SlashMenuProps) {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const [query, setQuery] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  // Picked as the menu opens and kept, so it shrinks towards the caret as you type instead of flipping over it
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  useEffect(() => registerLineHint(editor, $hint), [editor, $hint]);

  // The actions a query finds at the caret, with where they go
  const $found = useCallback(
    (query: string) => {
      const target = $target();

      return target
        ? {
            target,
            actions: rankActions(
              query,
              $availableActions(editor, definition, {
                targetKey: target.getKey(),
                typed: `/${query}`,
              }),
            ),
          }
        : null;
    },
    [editor, definition, $target],
  );

  const trigger = useSlashTrigger(
    useCallback((query: string) => !!$found(query)?.actions.length, [$found]),
  );

  // Ranked only while the menu is open: this renders with every key typed in the document
  const options =
    query === null
      ? []
      : editor.getEditorState().read(
          () => {
            const found = $found(query);

            return (
              found?.actions.map((action) => new SlashOption(action, found.target.getKey())) ?? []
            );
          },
          { editor },
        );

  const highlighted = (index: number | null) => options[index ?? 0]?.action;

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
      options={options}
      onOpen={(resolution) => setSide(roomierSide(resolution.getRect()))}
      onQueryChange={(value) => {
        setQuery(value);
        setError(undefined);
      }}
      onClose={() => {
        setQuery(null);
        setError(undefined);
      }}
      triggerFn={(text, currentEditor) => ($target() ? trigger(text, currentEditor) : null)}
      // Above the editor's own arrow/Enter handling (COMMAND_PRIORITY_LOW), so an open menu always gets the keys
      commandPriority={COMMAND_PRIORITY_NORMAL}
      anchorClassName="z-popup"
      onSelectOption={(option, text, close) => {
        const line = $getNodeByKey(option.targetKey);

        if (
          line &&
          $turnLineInto(definition, option.action.id, line, text?.getTextContent() ?? "", () =>
            text?.remove(),
          )
        )
          return close();

        const outcome = $executeAction(
          editor,
          definition,
          option.action.id,
          { targetKey: option.targetKey, typed: text?.getTextContent() },
          () => text?.remove(),
        );

        if (outcome.executed) {
          close();
          outcome.result?.afterClose?.();
        } else setError(outcome.error ?? cannotInsert);
      }}
      menuRenderFn={(anchor, { selectedIndex, setHighlightedIndex, selectOptionAndCleanUp }) =>
        anchor.current && (
          // Placed by the popover rather than where Lexical puts its anchor, so it stays on screen and clear of the
          // bar. The caret keeps the focus: typing and the arrow keys stay the editor's
          <Popover.Root open>
            <Popover.Content
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
              className={cn(
                instant,
                "flex w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 text-14",
                className,
              )}
            >
              {/* Lexical points aria-activedescendant at the highlighted option; this also says it aloud */}
              <p role="status" className="sr-only">
                {highlighted(selectedIndex)?.title}
              </p>
              <div className={cn(actionListBox, "min-h-0")} role="listbox" aria-label={label}>
                <ActionList
                  actions={options.map((option) => option.action)}
                  searching={!!query}
                  selectedIndex={selectedIndex ?? 0}
                  onHighlight={setHighlightedIndex}
                  onSelect={(_action, index) => selectOptionAndCleanUp(options[index]!)}
                  optionId={(index) => `typeahead-item-${index}`}
                  optionRef={(index, element) => options[index]?.setRefElement(element)}
                  error={error}
                  empty={empty}
                />
              </div>
              <ActionDescription action={highlighted(selectedIndex)} />
            </Popover.Content>
          </Popover.Root>
        )
      }
    />
  );
}
