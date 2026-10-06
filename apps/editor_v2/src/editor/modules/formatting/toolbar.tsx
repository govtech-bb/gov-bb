import { Popover } from "@base-ui/react/popover";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  mergeRegister,
  type RangeSelection,
  type LexicalNode,
  type TextFormatType,
} from "lexical";
import { LinkBreak, LinkSimple, TextB, TextItalic } from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { panel } from "../../../ui/select";
import { Button } from "../../../ui/button";
import { Tip } from "../../../ui/tooltip";
import { composing } from "./editing";
import { isSafeLinkUrl } from "../links/url";

/** Formatting controls apply only to non-empty selections in rich-text blocks. */
export function $textSelection(isPlainText: (node: LexicalNode) => boolean) {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || selection.isCollapsed() || !selection.getTextContent())
    return null;
  const nodes = [selection.anchor.getNode(), selection.focus.getNode(), ...selection.getNodes()];

  return nodes.every((node) => {
    const block = node.getTopLevelElement();

    return block && !isPlainText(block);
  })
    ? selection
    : null;
}

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

          // Require selected text for bold; underline has no Markdown representation.
          if (!event.shiftKey && ((key === "b" && !selected) || key === "u"))
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

  const state =
    open &&
    editor.isEditable() &&
    editor.getEditorState().read(
      () => {
        const selection = $textSelection(isPlainText);

        return (
          selection && {
            bold: selection.hasFormat("bold"),
            italic: selection.hasFormat("italic"),
            link: $link(selection)?.getURL() ?? null,
          }
        );
      },
      { editor },
    );

  if (!state) return null;

  const format = (type: TextFormatType) => () => {
    if (editor.isEditable()) editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);
  };

  const link = (url: string | null) => {
    if (editor.isEditable())
      editor.dispatchCommand(
        TOGGLE_LINK_COMMAND,
        url === null ? null : { url, target: "_blank", rel: "noopener noreferrer" },
      );
  };

  return (
    <Popover.Root open onOpenChange={(next) => !next && setOpen(false)}>
      <Popover.Portal>
        {/* Above the selection, so it never covers the line being read next */}
        <Popover.Positioner
          anchor={anchor}
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 outline-none"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            className="flex items-center gap-0.5 rounded-sm bg-white px-1 font-sans shadow-popup outline-none transition-opacity duration-180 ease-out-cubic data-ending-style:opacity-0 data-starting-style:opacity-0"
          >
            <Action tip="Bold" active={state.bold} icon={<TextB />} onClick={format("bold")} />
            <Action
              tip="Italic"
              active={state.italic}
              icon={<TextItalic />}
              onClick={format("italic")}
            />
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
                  <Popover.Portal>
                    <Popover.Positioner
                      side="bottom"
                      align="start"
                      sideOffset={5}
                      className="z-50 outline-none"
                    >
                      <Popover.Popup finalFocus={false} className={panel}>
                        <LinkField
                          url={state.link ?? ""}
                          isValidLink={isValidLink}
                          onApply={(url) => {
                            link(url);
                            setLinking(false);
                          }}
                        />
                      </Popover.Popup>
                    </Popover.Positioner>
                  </Popover.Portal>
                </Popover.Root>
                {state.link && (
                  <Action tip="Remove link" icon={<LinkBreak />} onClick={() => link(null)} />
                )}
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
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
      className="my-1 aria-pressed:bg-blue-10 aria-pressed:text-blue-80 not-disabled:aria-pressed:hover:bg-blue-10 not-disabled:aria-pressed:hover:text-blue-80"
    />
  );

  return <Tip content={tip}>{render(button)}</Tip>;
}

function LinkField({
  url,
  isValidLink,
  onApply,
}: {
  url: string;
  isValidLink: (url: string) => boolean;
  onApply: (url: string) => void;
}) {
  const [value, setValue] = useState(url);
  const [error, setError] = useState<string>();
  const errorId = useId();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();

        const next = value.trim();

        if (!next) {
          setError("Enter a link destination.");

          return;
        }

        if (!isValidLink(next)) {
          setError(
            "Enter a relative link or a supported address, such as https, email or telephone.",
          );

          return;
        }

        onApply(next);
      }}
      className="flex w-90 max-w-[calc(100vw-2rem)] flex-wrap p-2"
    >
      <input
        type="text"
        inputMode="url"
        autoFocus
        defaultValue={url}
        placeholder="https://example.gov.bb or /guidance"
        aria-label="Link"
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError(undefined);
        }}
        className="mr-2 h-8 min-w-0 flex-1 rounded-sm bg-white px-2 text-14 text-ink shadow-input outline-none placeholder:text-placeholder hover:shadow-input-hover focus:shadow-input-focus max-sm:text-16"
      />
      <Button type="submit" variant="accent">
        Apply
      </Button>
      {error && (
        <p id={errorId} role="alert" className="mt-2 w-full text-14 text-error">
          {error}
        </p>
      )}
    </form>
  );
}
