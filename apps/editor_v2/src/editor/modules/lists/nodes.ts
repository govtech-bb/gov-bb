import {
  $create,
  $getState,
  $getStateChange,
  $setState,
  createState,
  ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import { cn } from "../../../cn";
import { container, placeholder, el, $static } from "../../react/block-dom";
import { $depth, $setDepth } from "../../core/document-state";

/** GovBB's list line: one root block per item, so the gutter and selection work per line. */
function $listLineDOM(kind: "bullet" | "number", index = 0) {
  const dom = el("div", cn(container, "relative py-1 pl-6 [&:not(:has(+[data-list]))]:pb-2"), {
    "data-list": kind,
  });

  const marker = $static(
    "span",
    "absolute top-1 right-[calc(100%-1.125rem)] flex h-[1.5em] items-center whitespace-nowrap tabular-nums",
    { "data-marker": "" },
  );

  if (kind === "bullet") marker.append(el("span", "size-1.5 rounded-full bg-current"));
  else marker.textContent = `${index + 1}.`;
  dom.append(
    marker,
    el("div", cn("min-w-0 leading-[1.5]", placeholder), {
      "data-text": "",
      "data-placeholder": "List item",
    }),
  );

  return dom;
}

export class BulletNode extends ElementNode {
  override $config() {
    return this.config("bullet", { extends: ElementNode });
  }
  override createDOM() {
    return $listLineDOM("bullet");
  }
  override updateDOM() {
    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    return super.getDOMSlot(dom).withElement(dom.querySelector<HTMLElement>("[data-text]")!);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    const next = $setDepth($createBulletNode(), $depth(this));
    this.insertAfter(next, restoreSelection);

    return next;
  }
}

/** A numbered item's place in its list, kept by NumberNode's transform. */
export const listIndexState = createState("listIndex", {
  parse: (v) => (typeof v === "number" ? v : 0),
});

export class NumberNode extends ElementNode {
  override $config() {
    return this.config("number", {
      extends: ElementNode,
      $transform: (node: NumberNode) => {
        let index = 0;

        for (const next of $listRun(node)) {
          const at = index++;
          $setState(next, listIndexState, () => at);
        }
      },
    });
  }
  override createDOM() {
    return $listLineDOM("number", $getState(this, listIndexState));
  }
  override updateDOM(prev: this, dom: HTMLElement) {
    if ($getStateChange(this, prev, listIndexState))
      dom.querySelector("[data-marker]")!.textContent = `${$getState(this, listIndexState) + 1}.`;

    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    return super.getDOMSlot(dom).withElement(dom.querySelector<HTMLElement>("[data-text]")!);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    const next = $setDepth($createNumberNode(), $depth(this));
    this.insertAfter(next, restoreSelection);

    return next;
  }
}

export const $createBulletNode = (): BulletNode => $create(BulletNode);

export const $createNumberNode = (): NumberNode => $create(NumberNode);

export const $createListLine = (kind: "bullet" | "number") =>
  kind === "bullet" ? $createBulletNode() : $createNumberNode();

export const $isListLine = (
  node: LexicalNode | null | undefined,
): node is BulletNode | NumberNode => node instanceof BulletNode || node instanceof NumberNode;

/** Consecutive lines of the same list kind and depth. */
export function $listRun(line: LexicalNode) {
  const $same = (node: LexicalNode | null): node is BulletNode | NumberNode =>
    $isListLine(node) && node.getType() === line.getType() && $depth(node) === $depth(line);

  let first = line;

  for (let prev = first.getPreviousSibling(); $same(prev); prev = first.getPreviousSibling())
    first = prev!;
  const run: (BulletNode | NumberNode)[] = [];

  for (let next: LexicalNode | null = first; next && $same(next); next = next.getNextSibling())
    run.push(next);

  return run;
}
