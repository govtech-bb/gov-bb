import { $getDocument, setDOMUnmanaged } from "lexical";
import { cn } from "../../cn";

// Transparent borders keep block spacing from collapsing. Selected blocks include the borders
// and extend their highlight into the gutter, joining adjacent selections into one band.
export const container =
  "relative border-y border-transparent bg-clip-padding data-selected:bg-highlight data-selected:bg-clip-border data-selected:shadow-[-12px_0_0_var(--color-highlight),12px_0_0_var(--color-highlight)] " +
  // An overlay mutes hidden blocks without changing the opacity of their controls.
  "data-hidden:after:pointer-events-none data-hidden:after:absolute data-hidden:after:-inset-px data-hidden:after:z-1 data-hidden:after:bg-white/70 data-hidden:after:content-['']" +
  // A nested block's indent, set by markNesting (nesting.ts)
  " ml-(--nest) data-disabled:[&_[data-drawn]]:bg-grey-10 data-disabled:[&_[data-drawn]]:border-grey-60";

// Empty blocks show a placeholder. Lexical keeps a lone <br> in an empty element; the text is
// floated so the caret stays at the start (the ProseMirror trick).
export const ghostBase = "before:pointer-events-none before:float-left before:h-0";

export const ghost = `${ghostBase} before:text-subtle`;

export const placeholder = `${ghost} has-[>br:only-child]:before:content-[attr(data-placeholder)]`;

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

/** The tool's tooltip, in CSS: node DOM can't use the React <Tip>. Shows while its `group/tip` parent is hovered. */
export function $tip(text: string, side: "top" | "bottom") {
  const tip = el(
    "span",
    cn(
      "pointer-events-none invisible absolute left-1/2 z-60 -translate-x-1/2 rounded-sm bg-ink px-2 py-1 font-sans text-12 leading-4 font-semibold whitespace-nowrap text-white opacity-0 transition-[opacity,visibility] duration-200 ease-out group-hover/tip:visible group-hover/tip:opacity-100",
      side === "top" ? "bottom-full mb-2.5" : "top-full mt-2.5",
    ),
  );

  tip.textContent = text;

  return tip;
}

/** A Phosphor icon (raw SVG: node DOM is built outside React), sized. */
export const icon = (svg: string, size = 18) =>
  svg.replace("<svg ", `<svg width="${size}" height="${size}" aria-hidden="true" `);
