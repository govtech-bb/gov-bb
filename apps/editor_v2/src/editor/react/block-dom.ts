import {
  $getDocument,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  mergeRegister,
  setDOMUnmanaged,
  type ElementNode,
  type LexicalEditor,
} from "lexical";
import { cn } from "../../cn";

// Transparent borders keep block spacing from collapsing. Selected blocks include the borders
// and extend their highlight into the gutter, joining adjacent selections into one band, with an ultramarine edge at its
// start: the pale highlight alone is barely there on white, the edge is over 3:1.
export const container =
  "relative border-y border-transparent bg-clip-padding data-selected:bg-highlight data-selected:bg-clip-border data-selected:shadow-[-12px_0_0_var(--color-highlight),12px_0_0_var(--color-highlight),-15px_0_0_var(--color-blue-40)] " +
  // A hidden block keeps its full contrast and says so in words, on a line after its content
  "data-hidden:after:block data-hidden:after:w-fit data-hidden:after:pt-1 data-hidden:after:state-tag data-hidden:after:content-['Hidden']" +
  // A nested block's indent, set by markNesting (nesting.ts)
  " ml-(--nest) data-disabled:[&_[data-drawn]]:bg-grey-10 data-disabled:[&_[data-drawn]]:border-grey-60";

// Empty blocks show a placeholder. Lexical keeps a lone <br> in an empty element; the text is
// floated so the caret stays at the start (the ProseMirror trick).
export const ghostBase = "before:pointer-events-none before:float-left before:h-0";

export const ghost = `${ghostBase} before:text-subtle`;

export const placeholder = `${ghost} has-[>br:only-child]:before:content-[attr(data-placeholder)]`;

/** An empty line's hint, from its data-line-hint (registerLineHint), which screen readers skip. */
export const lineHint = `${ghost} has-[>br:only-child]:before:content-[attr(data-line-hint)_/_""]`;

/** The empty line holding a collapsed caret. */
export function $caretLine(): ElementNode | null {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const anchor = selection.anchor.getNode();
  const line = $isElementNode(anchor) ? anchor : anchor.getParent();

  return line && !line.isInline() && line.isEmpty() ? line : null;
}

/**
 * A hint on one empty line: `$hint` picks the line and its
 * words, worded for where the line is, such as the caret's line while the editor has the focus. The words go in the
 * line's data-line-hint, which `lineHint` shows while the line is empty.
 */
export function registerLineHint(
  editor: LexicalEditor,
  $hint: (focused: boolean) => readonly [line: ElementNode, words: string] | null,
) {
  const root = editor.getRootElement();
  let focused = !!root?.contains(root.ownerDocument.activeElement);
  let hinted: HTMLElement | null = null;

  const show = () => {
    const hint = editor.getEditorState().read(
      () => {
        const found = editor.isEditable() ? $hint(focused) : null;

        return found && ([editor.getElementByKey(found[0].getKey()), found[1]] as const);
      },
      { editor },
    );

    if (hinted && hinted !== hint?.[0]) hinted.removeAttribute("data-line-hint");
    hint?.[0]?.setAttribute("data-line-hint", hint[1]);
    hinted = hint?.[0] ?? null;
  };

  const focus = (next: boolean) => () => {
    focused = next;
    show();

    return false;
  };

  show();

  return mergeRegister(
    editor.registerUpdateListener(show),
    editor.registerEditableListener(show),
    editor.registerCommand(FOCUS_COMMAND, focus(true), COMMAND_PRIORITY_LOW),
    editor.registerCommand(BLUR_COMMAND, focus(false), COMMAND_PRIORITY_LOW),
    () => hinted?.removeAttribute("data-line-hint"),
  );
}

export function el(tag: string, className: string, attrs: Record<string, string> = {}) {
  const node = $getDocument().createElement(tag);
  node.className = className;

  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);

  return node;
}

/** Static DOM beside a node's slot: not editable, and off-limits to Lexical's mutation observer. */
export function $static(tag: string, className: string, attrs: Record<string, string> = {}) {
  const node = el(tag, className, { contenteditable: "false", "aria-hidden": "true", ...attrs });
  setDOMUnmanaged(node);

  return node;
}

/**
 * The tool's tooltip, in CSS: node DOM can't use the React <Tip>. Shows while its `group/tip` parent is hovered, and while
 * its block holds the caret, which is where the keyboard is.
 */
export function $tip(text: string, side: "top" | "bottom") {
  const tip = el(
    "span",
    cn(
      "pointer-events-none invisible absolute left-1/2 z-tooltip -translate-x-1/2 rounded-sm bg-ink px-2 py-1 font-sans text-12 leading-4 font-semibold whitespace-nowrap text-white opacity-0 transition-[opacity,visibility] duration-200 ease-out group-hover/tip:visible group-hover/tip:opacity-100 in-data-current:visible in-data-current:opacity-100",
      side === "top" ? "bottom-full mb-2.5" : "top-full mt-2.5",
    ),
  );

  tip.textContent = text;

  return tip;
}

/**
 * A block's state in words, such as Disabled, in node DOM (state-tag, index.css): visible text and read out, with an
 * optional tip. `className` places it and sets its display.
 */
export function $stateTag(
  text: string,
  className: string,
  tip?: { text: string; side: "top" | "bottom" },
) {
  const tag = $static("span", cn("group/tip relative items-center state-tag", className), {
    "aria-hidden": "false",
  });

  tag.append(text);

  if (tip) tag.append($tip(tip.text, tip.side));

  return tag;
}

/** A Phosphor icon (raw SVG: node DOM is built outside React), sized. */
export const icon = (svg: string, size = 18) =>
  svg.replace("<svg ", `<svg width="${size}" height="${size}" aria-hidden="true" `);
