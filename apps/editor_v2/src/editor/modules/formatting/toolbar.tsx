import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  $setTextFormat,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  mergeRegister,
  type RangeSelection,
  type LexicalNode,
  type TextFormatType,
} from "lexical";
import {
  CaretDown,
  LinkBreak,
  LinkSimple,
  TextB,
  TextItalic,
  TextTSlash,
} from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { belowBar, Popover } from "../../../ui/popover";
import { Button } from "../../../ui/button";
import { LinkForm } from "../../../ui/link-picker";
import { Tip } from "../../../ui/tooltip";
import { TurnIntoMenu } from "../../../ui/turn-into";
import { useLatched } from "../../../ui/use-latched";
import { useEditorDefinition, useLinkPages } from "../../react/composer";
import { turnIntoOptions } from "../../react/turn-into";
import { composing } from "./editing";
import { isSafeLinkUrl, linkAddress } from "../links/url";

/** The caret or selection, when all of it is in rich-text blocks, where text can be formatted. */
export function $formattable(isPlainText: (node: LexicalNode) => boolean) {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return null;
  const nodes = [selection.anchor.getNode(), selection.focus.getNode(), ...selection.getNodes()];

  return nodes.every((node) => {
    const block = node.getTopLevelElement();

    return block && !isPlainText(block);
  })
    ? selection
    : null;
}

/** Formatting controls apply only to non-empty selections in rich-text blocks. */
export function $textSelection(isPlainText: (node: LexicalNode) => boolean) {
  const selection = $formattable(isPlainText);

  return selection && !selection.isCollapsed() && selection.getTextContent() ? selection : null;
}

// Everything Clear formatting takes off, links aside
const plain = {
  bold: false,
  italic: false,
  strikethrough: false,
  code: false,
  underline: false,
  subscript: false,
  superscript: false,
  highlight: false,
};

const $link = (selection: RangeSelection) =>
  [selection.anchor, selection.focus]
    .map((point) => $findMatchingParent(point.getNode(), $isLinkNode))
    .find($isLinkNode);

/**
 * Opens beneath a rich-text selection after mouseup or keyup. Supports bold, italic
 * and links; the Markdown representation does not support underline or colour.
 */
const richText = () => false;

export type ToolbarPolicy = {
  isPlainText?: (node: LexicalNode) => boolean;
  linksEnabled?: boolean;
  isValidLink?: (url: string) => boolean;
};

export function Toolbar({
  isPlainText = richText,
  linksEnabled = true,
  isValidLink = isSafeLinkUrl,
}: ToolbarPolicy = {}) {
  const [editor] = useLexicalComposerContext();
  const { turnInto } = useEditorDefinition();
  const pages = useLinkPages();
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const openRef = useRef(false);
  openRef.current = open;
  // The selection's place on screen, kept while a field in the menu has the focus
  const range = useRef<Range | null>(null);

  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () => range.current?.getBoundingClientRect() ?? new DOMRect(),
    }),
    [],
  );

  useEffect(() => {
    const qualifies = () =>
      editor.isEditable() &&
      editor.getEditorState().read(() => !!$textSelection(isPlainText), { editor });

    const remember = () => {
      const dom = window.getSelection();

      if (dom?.rangeCount && !dom.isCollapsed && editor.getRootElement()?.contains(dom.anchorNode))
        range.current = dom.getRangeAt(0).cloneRange();
    };

    const show = () => {
      if (!qualifies()) return;
      remember();
      setOpen(true);
    };

    let timer = 0;

    const onMouseUp = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(show, 100);
    };

    const onKeyUp = (event: KeyboardEvent) =>
      !composing(event) && event.key !== "Escape" && (qualifies() ? show() : setOpen(false));

    return mergeRegister(
      editor.registerEditableListener((editable) => {
        if (!editable) {
          setOpen(false);
          setLinking(false);
        }
      }),
      editor.registerRootListener((root, previous) => {
        previous?.removeEventListener("mouseup", onMouseUp);
        previous?.removeEventListener("keyup", onKeyUp);
        root?.addEventListener("mouseup", onMouseUp);
        root?.addEventListener("keyup", onKeyUp);
      }),
      editor.registerUpdateListener(() => {
        if (!qualifies()) return (setOpen(false), setLinking(false));
        remember();
        rerender();
      }),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            !editor.isEditable() ||
            composing(event) ||
            !(event.metaKey || event.ctrlKey) ||
            event.altKey
          )
            return false;
          const key = event.key.toLowerCase();
          const selected = !!$textSelection(isPlainText);

          if (linksEnabled && !event.shiftKey && key === "k" && selected) {
            event.preventDefault();
            remember();
            setOpen(true);
            setLinking(true);

            return true;
          }

          // Bold and italic start at the caret too, but only where the block takes formatting; underline has no
          // Markdown representation
          if (
            !event.shiftKey &&
            (((key === "b" || key === "i") && !$formattable(isPlainText)) || key === "u")
          )
            return (event.preventDefault(), true);

          return false;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
      // Esc closes the menu first; the next one selects the block
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => openRef.current && (setOpen(false), true),
        COMMAND_PRIORITY_NORMAL,
      ),
      () => window.clearTimeout(timer),
    );
  }, [editor, isPlainText, linksEnabled]);

  const current =
    open && editor.isEditable()
      ? editor.getEditorState().read(
          () => {
            const selection = $textSelection(isPlainText);

            return (
              selection && {
                bold: selection.hasFormat("bold"),
                italic: selection.hasFormat("italic"),
                link: $link(selection)?.getURL() ?? null,
                turnInto: turnInto?.$choices() ?? null,
              }
            );
          },
          { editor },
        )
      : null;

  // What it showed last, while it fades out
  const state = useLatched(current);

  if (!state) return null;

  const format = (type: TextFormatType) => () => {
    if (editor.isEditable()) editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);
  };

  // Each turn is a step of its own in the undo history
  const turn = (value: string) => {
    if (!editor.isEditable()) return;
    editor.update(() => turnInto?.$turnInto(value), { tag: HISTORY_PUSH_TAG });
  };

  // A step of its own in the undo history, as a format change is
  const clear = () => {
    if (editor.isEditable())
      editor.update(
        () => {
          const selection = $getSelection();

          if ($isRangeSelection(selection)) $setTextFormat(selection, plain);
        },
        { tag: HISTORY_PUSH_TAG },
      );
  };

  const link = (url: string | null) => {
    if (editor.isEditable())
      editor.dispatchCommand(
        TOGGLE_LINK_COMMAND,
        url === null ? null : { url, target: "_blank", rel: "noopener noreferrer" },
      );
  };

  return (
    <Popover.Root open={!!current} onOpenChange={(next) => !next && setOpen(false)}>
      {/* Above the selection, so it never covers the line being read next, unless the document's bar is in the way.
          It only fades, as it comes and goes with every selection */}
      <Popover.Content
        aria-label="Text formatting"
        anchor={anchor}
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={belowBar()}
        initialFocus={false}
        finalFocus={false}
        className="flex items-center gap-0.5 overflow-visible p-0 px-1 motion-safe:starting:scale-100 motion-safe:data-starting-style:scale-100 motion-safe:data-ending-style:scale-100"
      >
        {state.turnInto && (
          <>
            <TurnIntoMenu
              value={state.turnInto.value}
              options={turnIntoOptions(state.turnInto)}
              onValueChange={turn}
              // Back to the text, with its selection, rather than the button
              finalFocus={() => editor.focus()}
              trigger={
                <Button
                  iconEnd={<CaretDown />}
                  onMouseDown={keepSelection}
                  className="my-1 font-normal text-ink"
                >
                  <span className="sr-only">Turn into: </span>
                  {state.turnInto.choices.find((choice) => choice.value === state.turnInto?.value)
                    ?.label ?? "Turn into"}
                </Button>
              }
            />
            <Divider />
          </>
        )}
        <Action tip="Bold" active={state.bold} icon={<TextB />} onClick={format("bold")} />
        <Action
          tip="Italic"
          active={state.italic}
          icon={<TextItalic />}
          onClick={format("italic")}
        />
        <Action tip="Clear formatting" icon={<TextTSlash />} onClick={clear} />
        {linksEnabled && (
          <>
            <Divider />
            {/* Closing the field without a link (Esc) puts the focus back on the selected text */}
            <Popover.Root
              open={linking}
              onOpenChange={(next) => (setLinking(next), !next && editor.focus())}
            >
              <Action
                tip={state.link ? "Edit link" : "Add link"}
                active={!!state.link}
                icon={<LinkSimple />}
                render={(button) => <Popover.Trigger render={button} />}
              />
              {/* Under the selected words, not over them, which the address being typed is for */}
              <Popover.Content
                aria-label={state.link ? "Edit link" : "Add link"}
                anchor={anchor}
                side="bottom"
                align="start"
                sideOffset={5}
                collisionPadding={belowBar()}
                finalFocus={false}
                className="p-0"
              >
                <LinkForm
                  url={state.link ?? ""}
                  pages={pages}
                  toAddress={(typed) => linkAddress(typed, isValidLink)}
                  onApply={(url) => {
                    link(url);
                    setLinking(false);
                  }}
                />
              </Popover.Content>
            </Popover.Root>
            {state.link && (
              <Action tip="Remove link" icon={<LinkBreak />} onClick={() => link(null)} />
            )}
          </>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}

// Buttons keep the editor's focus, and with it the selection
const keepSelection = (e: MouseEvent) => e.preventDefault();

const Divider = () => <div className="mx-1 h-9 w-px bg-line" />;

function Action({
  tip,
  active,
  icon,
  onClick,
  render = (button) => button,
}: {
  tip: string;
  active?: boolean;
  icon: ReactNode;
  onClick?: () => void;
  render?: (button: ReactElement) => ReactElement;
}) {
  const button = (
    <Button
      aria-label={tip}
      aria-pressed={active}
      icon={icon}
      onMouseDown={keepSelection}
      onClick={onClick}
      className="my-1"
    />
  );

  return <Tip content={tip}>{render(button)}</Tip>;
}
