import { useEditable, useEditableUpdate, useRead } from "../../react/logic-hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
  type TriggerFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setState,
  COMMAND_PRIORITY_NORMAL,
  mergeRegister,
  RootNode,
  SKIP_DOM_SELECTION_TAG,
  type NodeKey,
} from "lexical";
import { Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../cn";
import { rankActions } from "../../../editor/core/actions";
import { Input } from "../../../ui/input";
import { RowContent } from "../../../ui/menu";
import { Popover } from "../../../ui/popover";
import { buttonRow, groupLabel, listEmpty, row, surface } from "../../../ui/surface";
import { fieldIcon } from "../../react/logic-pickers";
import { $isPlainText, $isWidgetNode } from "../../editor/nodes";
import {
  $createMentionNode,
  $createNativeMentionNode,
  $isMentionNode,
  $mentionDefault,
  $mentionsIn,
  defaultState,
  $nativeMentionReference,
  $setNativeMentionReference,
  type MentionNode,
} from "./node";
import { $mentionTargets, $updateMentions, $mentionable, type MentionTarget } from "./editor";
import { $nativeTargets } from "../logic/native-authoring";
import { NativeDisplayReferenceEditor } from "../logic/native-controls";
import type { DisplayReference } from "../../schema/types";

class FieldOption extends MenuOption {
  constructor(readonly field: MentionTarget) {
    super(field.key);
  }
}

const sections = [
  ["METADATA", "Mention metadata"],
  ["INPUT_FIELD", "Mention an input field"],
  ["CALCULATED_FIELD", "Mention a calculated field"],
] as const;

/** Typing @ at the start of a rich-text block or after a space opens the reference menu. */
export function MentionMenu() {
  const [editor] = useLexicalComposerContext();
  const editable = useEditable();
  const update = useEditableUpdate();
  const [query, setQuery] = useState<string | null>(null);
  const [fields, setFields] = useState<MentionTarget[]>([]);
  useEffect(() => {
    if (!editable) setQuery(null);
  }, [editable]);
  useEffect(() => {
    let known = new Set<string>();

    return mergeRegister(
      editor.registerNodeTransform(RootNode, (root) => $updateMentions(root, known)),
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(
          () => {
            if ($mentionsIn($getRoot()).length) known = new Set($mentionTargets().keys());
          },
          { editor },
        ),
      ),
    );
  }, [editor]);

  // Allow spaces and punctuation when searching question labels.
  const at = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    allowWhitespace: true,
    punctuation: "",
  });

  const trigger = useCallback<TriggerFn>(
    (text, editor) => {
      const selection = $getSelection(); // runs inside the plugin's editor.read

      const block = $isRangeSelection(selection)
        ? selection.anchor.getNode().getTopLevelElement()
        : null;

      return editor.isEditable() && block && !$isPlainText(block) && !$isWidgetNode(block)
        ? at(text, editor)
        : null;
    },
    [at],
  );

  const onQueryChange = useCallback((next: string | null) => {
    setQuery(next);

    if (next !== null) setFields($mentionable()); // inside the plugin's editor.read too
  }, []);

  // In the menu's order, so the keyboard walks it top to bottom
  const options = useMemo(
    () =>
      sections.flatMap(([type]) =>
        rankActions(
          query ?? "",
          fields.filter((f) => f.type === type),
        ).map((f) => new FieldOption(f)),
      ),
    [fields, query],
  );

  return (
    <LexicalTypeaheadMenuPlugin<FieldOption>
      options={options}
      triggerFn={trigger}
      onQueryChange={onQueryChange}
      anchorClassName="z-popup"
      commandPriority={COMMAND_PRIORITY_NORMAL}
      onSelectOption={(option, query, closeMenu) => {
        update(() => {
          if (!query) return;

          const mention = (
            option.field.nativeReference
              ? $createNativeMentionNode(option.field.nativeReference, option.field.title)
              : $createMentionNode(option.field.key, option.field.title)
          ).setFormat(query.getFormat());

          query.replace(mention);
          const space = $createTextNode(" ").setFormat(mention.getFormat());
          mention.insertAfter(space);
          space.select(1, 1);
        });
        closeMenu();
      }}
      menuRenderFn={(
        anchor,
        { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchor.current &&
        createPortal(
          <div
            className={cn(
              surface,
              "group/popup max-h-[min(524px,60vh)] w-75 overflow-y-auto py-1 [&>div:not(:last-child)]:mb-1 [&>div:not(:last-child)]:border-b [&>div:not(:last-child)]:border-line [&>div:not(:last-child)]:pb-1",
            )}
          >
            {sections.map(([type, title]) => {
              const items = options
                .map((option, index) => ({ option, index }))
                .filter(({ option }) => option.field.type === type);

              return (
                items.length > 0 && (
                  <div key={type}>
                    <div className={groupLabel}>{title}</div>
                    {items.map(({ option, index }) => (
                      <div
                        key={option.key}
                        ref={option.setRefElement}
                        role="option"
                        aria-selected={selectedIndex === index}
                        data-highlighted={selectedIndex === index ? "" : undefined}
                        className={row}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onMouseDown={(e) => e.preventDefault()} // keep the caret (and the menu) in the editor
                        onClick={() => selectOptionAndCleanUp(option)}
                      >
                        <RowContent icon={fieldIcon(option.field)}>{option.field.title}</RowContent>
                      </div>
                    ))}
                  </div>
                )
              );
            })}
            {!options.length && (
              <div className={listEmpty}>
                {query ? "No questions match" : "No questions above this line yet"}
              </div>
            )}
          </div>,
          anchor.current,
        )
      }
    />
  );
}

export function MentionSettings() {
  const [editor] = useLexicalComposerContext();
  const editable = useEditable();
  const update = useEditableUpdate();

  // The click's place on the page, so the menu stays by the mention when the page scrolls
  const [open, setOpen] = useState<{
    key: NodeKey;
    value: string;
    reference?: DisplayReference;
    x: number;
    y: number;
  } | null>(null);

  const targets = useRead($nativeTargets);
  useEffect(
    () =>
      editor.registerEditableListener((value) => {
        if (!value) setOpen(null);
      }),
    [editor],
  );
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!editor.isEditable()) return;

      const mention = editor.read(() => {
        if (!(e.target instanceof Node)) return;
        const node = $getNearestNodeFromDOMNode(e.target);

        return $isMentionNode(node)
          ? {
              key: node.getKey(),
              value: $mentionDefault(node),
              reference: $nativeMentionReference(node),
            }
          : null;
      });

      if (mention) setOpen({ ...mention, x: e.clientX + scrollX, y: e.clientY + scrollY });
    };

    return editor.registerRootListener((root, previous) => {
      previous?.removeEventListener("click", onClick);
      root?.addEventListener("click", onClick);
    });
  }, [editor]);

  if (!open || !editable) return null;

  // A field outside the editor keeps its focus
  const edit = (fn: (mention: MentionNode) => void) =>
    update(
      () => {
        const node = $getNodeByKey(open.key);

        if ($isMentionNode(node)) fn(node);
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );

  const close = (refocus: boolean) => {
    setOpen(null);

    if (refocus) editor.focus();
  };

  const anchor = {
    getBoundingClientRect: () => new DOMRect(open.x - scrollX, open.y - scrollY, 0, 0),
  };

  return (
    <Popover.Root
      open
      onOpenChange={(next, { reason }) => !next && close(reason !== "outside-press")}
    >
      <Popover.Content
        aria-label="Mention settings"
        anchor={anchor}
        side="bottom"
        align="start"
        finalFocus={false}
        className="w-64 p-0 py-1 [&>div:not(:last-child)]:mb-1 [&>div:not(:last-child)]:border-b [&>div:not(:last-child)]:border-line [&>div:not(:last-child)]:pb-1"
      >
        {open.reference ? (
          <div className="max-h-120 overflow-y-auto px-3.5 py-2">
            <NativeDisplayReferenceEditor
              value={open.reference}
              targets={targets}
              onChange={(reference) => {
                edit((mention) => $setNativeMentionReference(mention, reference));
                setOpen((current) => current && { ...current, reference });
              }}
            />
          </div>
        ) : (
          <div>
            <div className={groupLabel}>Default value</div>
            <div className="px-3.5 pt-0.5 pb-1.5">
              <Input
                size="sm"
                key={open.key}
                autoFocus
                defaultValue={open.value}
                aria-label="Default value"
                onChange={(e) => {
                  const value = e.target.value;
                  edit((mention) => $setState(mention, defaultState, value));
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault(); // the focus goes back to the editor: the Enter mustn't follow it there
                  close(true);
                }}
              />
            </div>
          </div>
        )}
        <div>
          <button
            type="button"
            className={buttonRow}
            onClick={() => {
              edit((mention) => mention.remove());
              close(true);
            }}
          >
            <RowContent icon={<Trash />}>Remove</RowContent>
          </button>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
