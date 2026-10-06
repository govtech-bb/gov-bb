import {
  $create,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  ElementNode,
  type LexicalEditor,
  type EditorConfig,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import { cn } from "../../../cn";
import { container, placeholder, el, $static } from "../../react/block-dom";
import { $deeperSiblings, $paragraphAfter } from "../../core/blocks";
import { $depth, $setDepth, $settings, $setSettings } from "../../core/document-state";

/** GovBB's disclosure summary. Its following, deeper blocks are the content, open on the canvas by default. */
export class ShowHideNode extends ElementNode {
  override $config() {
    return this.config("show-hide", { extends: ElementNode });
  }
  override createDOM(_: EditorConfig, editor: LexicalEditor) {
    const dom = el("div", cn(container, "pt-2 pb-2"), { "data-show-hide": "" });
    dom.toggleAttribute("data-folded", !!$settings(this).folded);
    const row = el("div", "flex items-start gap-2");

    const fold = $static(
      "span",
      "relative flex h-[1.5em] w-2 shrink-0 cursor-pointer items-center text-interactive before:absolute before:-inset-x-2 before:inset-y-0 before:content-['']",
      { "data-fold": "" },
    );

    fold.append(
      el(
        "span",
        "h-0 w-0 rotate-90 border-y-[6px] border-l-8 border-y-transparent border-l-current transition-transform duration-200 in-data-folded:rotate-0 motion-reduce:transition-none",
      ),
    );
    fold.addEventListener("mousedown", (e) => e.preventDefault());
    fold.addEventListener("click", () => {
      if (!editor.isEditable()) return;
      editor.update(() => {
        const node = $getNodeByKey(this.getKey());

        if ($isShowHideNode(node)) $toggleShowHide(node);
      });
    });
    row.append(
      fold,
      el(
        "div",
        cn(
          "min-w-0 leading-[1.5] text-interactive underline decoration-[max(1px,0.0625em)] underline-offset-[0.1em]",
          placeholder,
        ),
        { "data-text": "", "data-placeholder": "Name what it reveals, like ‘What is a parish?’" },
      ),
    );
    dom.append(row);

    return dom;
  }
  override updateDOM(_: this, dom: HTMLElement) {
    dom.toggleAttribute("data-folded", !!$settings(this).folded);

    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    return super.getDOMSlot(dom).withElement(dom.querySelector<HTMLElement>("[data-text]")!);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    if ($settings(this).folded) $setSettings(this, { folded: false });

    return $setDepth($paragraphAfter(this, restoreSelection), $depth(this) + 1);
  }
}

/** Fold the disclosure, keeping a caret in its content on the visible summary. */
export function $toggleShowHide(node: ShowHideNode) {
  const folded = !$settings(node).folded;
  const selection = $getSelection();

  if (folded && $isRangeSelection(selection)) {
    const block = selection.anchor.getNode().getTopLevelElement();

    if (block && $disclosureChildren(node).some((child) => child.is(block))) node.selectEnd();
  }

  $setSettings(node, { folded });
}

export const $createShowHideNode = () => $create(ShowHideNode);

export const $isShowHideNode = (node: LexicalNode | null | undefined): node is ShowHideNode =>
  node instanceof ShowHideNode;

/** Disclosure contents stay as following root siblings with greater depth. */
export function $disclosureChildren(block: ShowHideNode): LexicalNode[] {
  return $deeperSiblings(block);
}
