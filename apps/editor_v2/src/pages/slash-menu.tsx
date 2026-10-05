import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useState } from "react";
import { createPortal } from "react-dom";
import { COMMAND_PRIORITY_NORMAL } from "lexical";
import {
  $availableActions,
  $executeAction,
  matchesAction,
  type EditorAction,
} from "../editor/core/actions";
import { useEditorDefinition } from "../editor/react/composer";
import { panel } from "../ui/select";
import { PageActionList } from "./action-menu";
import { $pageInsertionTarget } from "./insertion";

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
  const trigger = useBasicTypeaheadTriggerMatch("/", { minLength: 0, allowWhitespace: true });

  const options = editor.getEditorState().read(
    () => {
      const target = $pageInsertionTarget();

      return target
        ? $availableActions(editor, definition, { targetKey: target.getKey() })
            .filter((action) => matchesAction(action, query ?? ""))
            .map((action) => new PageOption(action, target.getKey()))
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
        const result = $executeAction(
          editor,
          definition,
          option.action.id,
          { targetKey: option.targetKey },
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
          <div
            className={`page-insert-menu page-action-list ${panel}`}
            role="listbox"
            aria-label="Insert page content"
          >
            <PageActionList
              actions={options.map((option) => option.action)}
              selectedIndex={selectedIndex ?? 0}
              onHighlight={setHighlightedIndex}
              onSelect={(_action, index) => selectOptionAndCleanUp(options[index]!)}
              optionId={(index) => `typeahead-item-${index}`}
              optionRef={(index, element) => options[index]?.setRefElement(element)}
              error={error}
            />
          </div>,
          anchor.current,
        )
      }
    />
  );
}
