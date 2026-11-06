import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  HISTORY_PUSH_TAG,
  type BaseSelection,
} from "lexical";
import { useRef } from "react";
import { $executeAction, type ActionOutcome, type EditorAction } from "@/editor";
import { ActionPicker, useEditorDefinition } from "@/editor/react";
import { openedByTouch } from "../ui/focus";
import { belowBar, Popover } from "../ui/popover";
import { useLatched } from "../ui/use-latched";
import type { PagePlace } from "./insertion";
import { PageMetadataNode } from "./metadata";

/** Where "+" or Add content opened the page's insert menu, and where its block goes. */
export type PageInsertMenuState = {
  anchor: HTMLElement;
  /** The block it inserts beside, or null at the end of the page. */
  key: string | null;
  /** Where the new block goes beside its block. */
  place: PagePlace;
  selection: BaseSelection | null;
  side: "top" | "bottom";
};

/** "+" and Add content's menu: a search over the blocks a page can insert. It keeps its place while it closes. */
export function PageInsertMenu({
  menu,
  onDone,
  onDismiss,
}: {
  menu: PageInsertMenuState | null;
  /** After a block went in. */
  onDone: () => void;
  /** Esc, or a press outside. */
  onDismiss: (reason: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const definition = useEditorDefinition();
  const shown = useLatched(menu);
  const search = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  // The block a new one goes beside: the page's last when the menu opened at its end
  const $beside = () => (shown?.key ? $getNodeByKey(shown.key) : $getRoot().getLastChild());
  const besideKey = editor.getEditorState().read(() => $beside()?.getKey(), { editor });
  const request = shown && besideKey ? { targetKey: besideKey, mode: shown.place } : null;

  const insert = (action: EditorAction) => {
    let outcome: ActionOutcome = { executed: false };

    editor.update(
      () => {
        let target = $beside();

        if (!target || target instanceof PageMetadataNode) {
          target = $createParagraphNode();
          $getRoot().append(target);
        }

        outcome = $executeAction(editor, definition, action.id, {
          targetKey: target.getKey(),
          mode: shown!.place,
        });
      },
      { tag: HISTORY_PUSH_TAG },
    );

    return outcome;
  };

  return (
    <Popover.Root open={!!menu} onOpenChange={(open, { reason }) => !open && onDismiss(reason)}>
      {shown && (
        <Popover.Content
          ref={popup}
          aria-label="Insert page content"
          anchor={shown.anchor}
          side={shown.side}
          align="start"
          collisionPadding={belowBar()}
          collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
          // Opened by a touch, the menu takes the focus itself, as the search's would bring up the keyboard over the
          // list. Otherwise the search does: focus before positioning must not scroll the page.
          initialFocus={(type) => {
            if (openedByTouch(type)) return popup.current;
            search.current?.focus({ preventScroll: true });

            return false;
          }}
          finalFocus={false}
          // page-insert-menu: the tests' hook, shared with the "/" menu
          className="page-insert-menu flex w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 text-14"
        >
          <ActionPicker.Root
            request={request}
            insert={insert}
            onInserted={(result) => {
              onDone();
              result?.afterClose?.();
              editor.focus();
            }}
          >
            <label className="mx-1.5 mt-1.5 flex items-center gap-2.5 border-b border-line px-2 pt-2.5 pb-3.5 text-muted [&>svg]:size-4 [&>svg]:shrink-0">
              <MagnifyingGlass aria-hidden="true" />
              <ActionPicker.Search
                ref={search}
                label="Search page content"
                placeholder="Search content…"
                className="w-full min-w-0 text-16 text-ink outline-offset-4"
              />
            </label>
            <ActionPicker.List
              label="Insert page content"
              empty="No content blocks match your search."
              className="max-h-[34rem] min-h-0"
            />
            <ActionPicker.Description />
          </ActionPicker.Root>
        </Popover.Content>
      )}
    </Popover.Root>
  );
}
