import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  type ElementNode,
  type ParagraphNode,
  type RangeSelection,
} from "lexical";
import { $depth, $setDepth, $settings, $setSettings } from "../../core/document-state";

export const composing = (event: KeyboardEvent) => event.isComposing || event.keyCode === 229;

export function $caretBlock() {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const block = selection.anchor.getNode().getTopLevelElement();

  return block && { selection, block };
}

export function $atEdge(selection: RangeSelection, block: ElementNode, start: boolean) {
  const { anchor } = selection;
  const node = anchor.getNode();

  if (node.is(block))
    return start ? anchor.offset === 0 : anchor.offset === block.getChildrenSize();
  const edge = start ? block.getFirstDescendant() : block.getLastDescendant();

  return !!edge?.is(node) && anchor.offset === (start ? 0 : node.getTextContentSize());
}

/** Enter at the start keeps the styled block intact and opens body text above it. */
export function $paragraphBefore(block: ElementNode): boolean {
  block.insertBefore($setDepth($createParagraphNode(), $depth(block)));

  return true;
}

/** Preserve the original block's text, nesting and visibility when leaving its presentation. */
export function $toText(block: ElementNode): ParagraphNode {
  const line = $setDepth(
    $setSettings($createParagraphNode(), { hidden: $settings(block).hidden }),
    $depth(block),
  );

  block.replace(line, true);
  line.selectStart();

  return line;
}
