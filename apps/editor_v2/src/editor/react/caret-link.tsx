import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  mergeRegister,
  type CommandListenerPriority,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useEffect, useState, type ComponentProps } from "react";
import { LinkAtCaret } from "../../ui/link-at-caret";
import { useLinkPages } from "./composer";
import { pressedShortcut } from "./shortcut";

/** A link, or something else with an address such as a button, as the caret finds it. */
export type CaretLink = {
  readonly key: NodeKey;
  /** Where it goes; undefined where it has no address of its own. */
  readonly url?: string;
  /** Whether it can do without an address. */
  readonly removable: boolean;
};

type Labels = Pick<
  ComponentProps<typeof LinkAtCaret>,
  "fallback" | "label" | "editLabel" | "removeLabel"
>;

/** The collapsed caret's node, where a link is found or a new one goes. */
function $caretNode() {
  const selection = $getSelection();

  return $isRangeSelection(selection) && selection.isCollapsed()
    ? selection.anchor.getNode()
    : null;
}

const same = (a: CaretLink | null, b: CaretLink | null) =>
  a?.key === b?.key && a?.url === b?.url && a?.removable === b?.removable;

/**
 * The link at the caret (LinkAtCaret) for one kind of link in an editor: `$find` finds it from the caret's node, and
 * `$apply` and `$remove` change it. ⌘K opens its form, or, away from one, `$insert` makes a new link at the caret where
 * `$canInsert` allows. Each change is an undo step of its own, and the focus goes back to the text.
 */
export function CaretLinkPopover({
  $find,
  $apply,
  $remove,
  $canInsert,
  $insert,
  toAddress,
  priority = COMMAND_PRIORITY_NORMAL,
  ...labels
}: {
  $find: (node: LexicalNode) => CaretLink | null;
  $apply: (key: NodeKey, url: string) => void;
  $remove?: (key: NodeKey) => void;
  $canInsert?: (node: LexicalNode) => boolean;
  /** Makes a link with these words at the caret. */
  $insert?: (url: string, text: string) => void;
  toAddress: (typed: string) => string | null;
  /** ⌘K's priority: higher for a link that holds text another kind would link. */
  priority?: CommandListenerPriority;
} & Labels) {
  const [editor] = useLexicalComposerContext();
  const pages = useLinkPages();
  const [found, setFound] = useState<CaretLink | null>(null);
  const [focused, setFocused] = useState(false);
  // The form: "edit" changes the link at the caret, "new" makes one there
  const [form, setForm] = useState<"edit" | "new" | null>(null);
  // Esc hides it until the caret leaves the link
  const [dismissed, setDismissed] = useState<NodeKey | null>(null);
  const [caret, setCaret] = useState<{ getBoundingClientRect: () => DOMRect } | null>(null);

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);

    return mergeRegister(
      editor.registerRootListener((root, previous) => {
        previous?.removeEventListener("focus", onFocus);
        previous?.removeEventListener("blur", onBlur);
        root?.addEventListener("focus", onFocus);
        root?.addEventListener("blur", onBlur);
        setFocused(!!root && root.ownerDocument.activeElement === root);
      }),
      editor.registerUpdateListener(({ editorState }) => {
        const next = editorState.read(() => {
          const node = $caretNode();

          return node && editor.isEditable() ? $find(node) : null;
        });

        setFound((current) => (same(current, next) ? current : next));
        setDismissed((key) => (key === next?.key ? key : null));
      }),
      editor.registerEditableListener((editable) => {
        if (editable) return;
        setForm(null);
        setFound(null);
      }),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (!editor.isEditable() || event.isComposing || !pressedShortcut(event, ["mod", "k"]))
            return false;
          const node = $caretNode();
          const link = node && $find(node);

          if (link) {
            setFound(link);
            setForm("edit");
          } else if (node && $insert && ($canInsert?.(node) ?? true)) {
            // A new link's form opens at the caret, or at its text where an empty line has no caret to measure
            const dom = window.getSelection();
            const range = dom?.rangeCount ? dom.getRangeAt(0).cloneRange() : undefined;
            const at = editor.getElementByKey(node.getKey());

            setCaret({
              getBoundingClientRect: () => {
                const rect = range?.getBoundingClientRect();

                return rect && (rect.width || rect.height)
                  ? rect
                  : (at?.getBoundingClientRect() ?? new DOMRect());
              },
            });
            setForm("new");
          } else return false;

          event.preventDefault();

          return true;
        },
        priority,
      ),
    );
  }, [editor, $find, $canInsert, $insert, priority]);

  const shown = !form && found && focused && dismissed !== found.key ? found.key : null;

  // Esc while the card shows puts the card away and nothing more. Without this, Lexical's own Esc, which leaves the
  // editor, took the card with it, and the next keystrokes went nowhere
  useEffect(() => {
    if (!shown) return;

    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        setDismissed(shown);

        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [editor, shown]);

  const done = () => {
    setForm(null);
    editor.focus();
  };

  const anchor = form === "new" ? caret : found && editor.getElementByKey(found.key);

  if (!anchor || !(form || (found && focused && dismissed !== found.key))) return null;

  return (
    <LinkAtCaret
      {...labels}
      anchor={anchor}
      url={form === "new" ? undefined : found?.url}
      editing={!!form}
      onEditingChange={(editing) => setForm(editing ? "edit" : null)}
      onRemove={
        form !== "new" && found?.removable && $remove
          ? () => {
              editor.update(() => $remove(found.key), { tag: HISTORY_PUSH_TAG });
              done();
            }
          : undefined
      }
      onClose={() => (form ? done() : setDismissed(found?.key ?? null))}
      pages={pages}
      toAddress={toAddress}
      onApply={(url, text) => {
        editor.update(
          () => {
            if (form === "new") $insert?.(url, text);
            else if (found) $apply(found.key, url);
          },
          { tag: HISTORY_PUSH_TAG },
        );
        done();
      }}
    />
  );
}
