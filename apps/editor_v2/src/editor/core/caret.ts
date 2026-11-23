import { $getSelection, $isRangeSelection, type ElementNode, type RangeSelection } from "lexical";

/** The top-level block holding a collapsed caret, with the selection; null for a range or no selection. */
export function $caretBlock() {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const block = selection.anchor.getNode().getTopLevelElement();

  return block && { selection, block };
}

/** Whether the selection's anchor is at the block's start, or with `start` false its end. Pass it collapsed. */
export function $atEdge(selection: RangeSelection, block: ElementNode, start: boolean) {
  const { anchor } = selection;
  const node = anchor.getNode();

  if (node.is(block))
    return start ? anchor.offset === 0 : anchor.offset === block.getChildrenSize();
  const edge = start ? block.getFirstDescendant() : block.getLastDescendant();

  return !!edge?.is(node) && anchor.offset === (start ? 0 : node.getTextContentSize());
}
