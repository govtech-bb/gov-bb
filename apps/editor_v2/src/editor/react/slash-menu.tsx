import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  PUNCTUATION,
  useBasicTypeaheadTriggerMatch,
  type TriggerFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $getNodeByKey,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  type NodeKey,
} from "lexical";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../cn";
import { ItemLabel, item, sectionLabel } from "../../ui/item";
import { panel } from "../../ui/select";
import {
  $availableActions,
  $executeAction,
  matchesAction,
  sectioned,
  type EditorAction,
} from "../core/actions";
import { useEditorDefinition } from "./composer";

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

// Allow punctuation used in block names and shortcuts, which Lexical otherwise treats as a query boundary.
const punctuation = PUNCTUATION.replace("#", "").replace("\\-", "").replace("'", "");

/** Type "/" in an ordinary text line to filter blocks, navigate with arrows and insert with Enter. */
export function SlashMenu() {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const [query, setQuery] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const slash = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
    allowWhitespace: true,
    punctuation,
  });

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

  const options = useMemo(() => {
    const q = query?.trim().toLowerCase();

    return editor.getEditorState().read(
      () => {
        const selection = $getSelection();

        const block = $isRangeSelection(selection)
          ? selection.anchor.getNode().getTopLevelElement()
          : null;

        return block
          ? $availableActions(editor, definition, { targetKey: block.getKey(), mode: "insert" })
              .filter((entry) => !q || matchesAction(entry, q))
              .map((entry) => new BlockOption(entry, block.getKey()))
          : [];
      },
      { editor },
    );
  }, [editor, definition, query]);

  return (
    <LexicalTypeaheadMenuPlugin<BlockOption>
      options={options}
      triggerFn={trigger}
      onQueryChange={(next) => {
        setQuery(next);
        setError(undefined);
      }}
      onClose={() => {
        setQuery(null);
        setError(undefined);
      }}
      anchorClassName="z-50"
      // Above the editor's own arrow/Enter handling (COMMAND_PRIORITY_LOW), so an open menu always gets the keys
      commandPriority={COMMAND_PRIORITY_NORMAL}
      onSelectOption={(option, query, closeMenu) => {
        const queryKey = query?.getKey();

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
      ) =>
        anchor.current &&
        createPortal(
          // Lexical points aria-activedescendant at the highlighted typeahead-item-N.
          <div
            role="listbox"
            aria-label="Insert block"
            className={cn(panel, "max-h-131 w-75 overflow-y-auto py-1.5")}
          >
            {error && (
              <div role="alert" className="px-3.5 py-1.5 text-14 text-red-700">
                {error}
              </div>
            )}
            {options.length === 0 && (
              <div className="px-3.5 py-1.5 text-14 text-subtle">No results</div>
            )}
            {sectioned(options).map(({ group, items }) => (
              <div
                key={group}
                className="not-last:mb-1.5 not-last:border-b not-last:border-line not-last:pb-1.5"
              >
                <div className={cn(sectionLabel, "px-3.5")}>{group}</div>
                {items.map(({ item: option, index }) => (
                  <div
                    key={option.key}
                    id={`typeahead-item-${index}`}
                    ref={option.setRefElement}
                    role="option"
                    aria-selected={selectedIndex === index}
                    data-highlighted={selectedIndex === index ? "" : undefined}
                    className={item}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(e) => e.preventDefault()} // keep the caret (and the menu) in the editor
                    onClick={() => selectOptionAndCleanUp(option)}
                  >
                    <ItemLabel icon={option.entry.icon}>{option.entry.title}</ItemLabel>
                  </div>
                ))}
              </div>
            ))}
          </div>,
          anchor.current,
        )
      }
    />
  );
}
