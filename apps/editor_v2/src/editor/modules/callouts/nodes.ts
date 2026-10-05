import { $create, ElementNode, type LexicalNode, type RangeSelection } from "lexical";
import { cn } from "../../../cn";
import { container, placeholder, el, $static } from "../../react/block-dom";
import { $paragraphAfter } from "../../core/blocks";
import { $depth, $setDepth } from "../../core/document-state";

/** One paragraph of SSB's inset text; Enter carries on in a text line. */
export class InsetNode extends ElementNode {
  override $config() {
    return this.config("inset", { extends: ElementNode });
  }
  override createDOM() {
    const dom = el("div", cn(container, "pt-2 pb-4"));
    const panel = el("div", "border-l-4 border-blue-20 bg-highlight px-6 py-3");
    panel.append(
      el("div", cn("leading-[1.5]", placeholder), {
        "data-text": "",
        "data-placeholder": "Inset text",
      }),
    );
    dom.append(panel);

    return dom;
  }
  override updateDOM() {
    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    return super.getDOMSlot(dom).withElement(dom.querySelector<HTMLElement>("[data-text]")!);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    return $setDepth($paragraphAfter(this, restoreSelection), $depth(this));
  }
}

/** One paragraph of SSB's warning text, with its roundel and spoken prefix. */
export class WarningNode extends ElementNode {
  override $config() {
    return this.config("warning", { extends: ElementNode });
  }
  override createDOM() {
    const dom = el("div", cn(container, "pt-2 pb-4"));
    const panel = el("div", "flex items-start gap-4 border-l-4 border-yellow-80 px-6 py-3");

    const roundel = $static(
      "span",
      "flex size-7 shrink-0 items-center justify-center rounded-full bg-yellow-80 font-bold text-ink",
    );

    roundel.textContent = "!";
    const prefix = $static("span", "sr-only", { "aria-hidden": "false" });
    prefix.textContent = "Warning:";
    panel.append(
      roundel,
      prefix,
      el("div", cn("min-w-0 flex-1 leading-[1.5]", placeholder), {
        "data-text": "",
        "data-placeholder": "Warning text",
      }),
    );
    dom.append(panel);

    return dom;
  }
  override updateDOM() {
    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    return super.getDOMSlot(dom).withElement(dom.querySelector<HTMLElement>("[data-text]")!);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    return $setDepth($paragraphAfter(this, restoreSelection), $depth(this));
  }
}

export const $createInsetNode = () => $create(InsetNode);

export const $createWarningNode = () => $create(WarningNode);

export const $isCallout = (node: LexicalNode | null | undefined): node is InsetNode | WarningNode =>
  node instanceof InsetNode || node instanceof WarningNode;
