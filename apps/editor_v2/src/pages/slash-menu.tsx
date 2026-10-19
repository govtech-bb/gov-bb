import { LexicalTypeaheadMenuPlugin, MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import {
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  COMMAND_PRIORITY_NORMAL,
  type ElementNode,
} from "lexical";
import {
  $availableActions,
  $executeAction,
  rankActions,
  type EditorAction,
} from "../editor/core/actions";
import { $turnLineInto } from "../editor/core/turn-into";
import { $caretLine, registerLineHint } from "../editor/react/block-dom";
import { useEditorDefinition } from "../editor/react/composer";
import { useSlashTrigger } from "../editor/react/slash-trigger";
import { cn } from "../cn";
import { listFooter, surface } from "../ui/surface";
import { actionList, PageActionList } from "./action-menu";
import { $pageInsertionTarget } from "./insertion";
import { PageMetadataNode } from "./metadata";
import { PageComponentNode } from "./nodes";

/** What an empty line on a page says, and the editor's description for screen readers. */
export const startWriting = "Start writing, or type / to add content.";

/** The hint on the caret's empty line, worded for the block it's in. A new page shows it on its first line. */
function $pageHint(focused: boolean): readonly [ElementNode, string] | null {
  const line = focused ? $caretLine() : null;

  if (!line) {
    const content = $getRoot()
      .getChildren()
      .filter((node) => !(node instanceof PageMetadataNode));

    return content.length === 1 && $isParagraphNode(content[0]) && content[0].isEmpty()
      ? [content[0], startWriting]
      : null;
  }

  const holder = $isListItemNode(line) ? line : line.getParent();

  // A heading names its level instead, and a table cell is too narrow for words
  if ($isHeadingNode(line) || holder?.getType() === "tablecell") return null;

  if ($isListItemNode(holder)) return [line, "List item"];

  if ($isQuoteNode(holder)) return [line, "Quote"];

  if (holder instanceof PageComponentNode)
    return [line, holder.getKind() === "details" ? "Details" : "Notice"];

  return [line, startWriting];
}

class PageOption extends MenuOption {
  constructor(
    readonly action: EditorAction,
    readonly targetKey: string,
  ) {
    super(action.id);
  }
}

export function PageSlashMenu() {
  const editable = useLexicalEditable();

  return editable ? <EditablePageSlashMenu /> : null;
}

function EditablePageSlashMenu() {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const [query, setQuery] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => registerLineHint(editor, $pageHint), [editor]);

  const trigger = useSlashTrigger(
    useCallback(
      (query: string) => {
        const target = $pageInsertionTarget();

        return (
          !!target &&
          rankActions(
            query,
            $availableActions(editor, definition, {
              targetKey: target.getKey(),
              typed: `/${query}`,
            }),
          ).length > 0
        );
      },
      [editor, definition],
    ),
  );

  const options = editor.getEditorState().read(
    () => {
      const target = $pageInsertionTarget();

      return target
        ? rankActions(
            query ?? "",
            $availableActions(editor, definition, {
              targetKey: target.getKey(),
              typed: `/${query ?? ""}`,
            }),
          ).map((action) => new PageOption(action, target.getKey()))
        : [];
    },
    { editor },
  );

  return (
    <LexicalTypeaheadMenuPlugin<PageOption>
      options={options}
      onQueryChange={(value) => {
        setQuery(value);
        setError(undefined);
      }}
      onClose={() => {
        setQuery(null);
        setError(undefined);
      }}
      triggerFn={(text, currentEditor) =>
        $pageInsertionTarget() ? trigger(text, currentEditor) : null
      }
      commandPriority={COMMAND_PRIORITY_NORMAL}
      anchorClassName="z-50"
      onSelectOption={(option, text, close) => {
        const line = $getNodeByKey(option.targetKey);

        if (
          line &&
          $turnLineInto(definition, option.action.id, line, text?.getTextContent() ?? "", () =>
            text?.remove(),
          )
        )
          return close();

        const result = $executeAction(
          editor,
          definition,
          option.action.id,
          { targetKey: option.targetKey, typed: text?.getTextContent() },
          () => text?.remove(),
        );

        if (result.executed) {
          close();
          result.result?.afterClose?.();
        } else setError(result.error ?? "This block cannot be inserted here.");
      }}
      menuRenderFn={(anchor, { selectedIndex, setHighlightedIndex, selectOptionAndCleanUp }) =>
        anchor.current &&
        createPortal(
          <>
            {/* Lexical points aria-activedescendant at the highlighted option; this also says it aloud */}
            <p role="status" className="sr-only">
              {options[selectedIndex ?? 0]?.action.title}
            </p>
            <div
              className={cn(
                "page-insert-menu flex w-[min(21rem,calc(100vw-2rem))] flex-col text-14",
                surface,
              )}
            >
              <div className={actionList} role="listbox" aria-label="Insert page content">
                <PageActionList
                  actions={options.map((option) => option.action)}
                  searching={!!query}
                  selectedIndex={selectedIndex ?? 0}
                  onHighlight={setHighlightedIndex}
                  onSelect={(_action, index) => selectOptionAndCleanUp(options[index]!)}
                  optionId={(index) => `typeahead-item-${index}`}
                  optionRef={(index, element) => options[index]?.setRefElement(element)}
                  error={error}
                />
              </div>
              {options[selectedIndex ?? 0]?.action.description && (
                <p className={listFooter} aria-hidden="true">
                  {options[selectedIndex ?? 0]!.action.description}
                </p>
              )}
            </div>
          </>,
          anchor.current,
        )
      }
    />
  );
}
