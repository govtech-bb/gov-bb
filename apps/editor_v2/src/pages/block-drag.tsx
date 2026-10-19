import {
  $addUpdateTag,
  $getNodeByKey,
  $getRoot,
  $isRootNode,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import type { Line } from "../editor/react/block-rail";
import { PageMetadataNode } from "./metadata";

// Where a page's dragged block may land. The rail's drag (useBlockDrag) does the rest.

/** The drag's data type: page blocks drop only on pages. */
export const PAGE_BLOCK_DRAG = "application/x-page-block";

/** Before or after one of the page's top-level blocks, with the line that shows it. */
export type PageDrop = { key: string; before: boolean; line: Line };

function $isContentBlock(node: LexicalNode | null): node is LexicalNode {
  return (
    !!node?.isAttached() && $isRootNode(node.getParent()) && !(node instanceof PageMetadataNode)
  );
}

function $canDrop(source: LexicalNode | null, target: LexicalNode | null, before: boolean) {
  return (
    $isContentBlock(source) &&
    $isContentBlock(target) &&
    !source.is(target) &&
    !(before ? source.getNextSibling()?.is(target) : source.getPreviousSibling()?.is(target))
  );
}

/** Blocks move whole: a block lands before the first block whose middle is below the point, or after the last. */
export function $pageDropAt(
  editor: LexicalEditor,
  anchor: HTMLElement,
  sourceKey: string,
  point: { x: number; y: number },
): PageDrop | null {
  const bounds = anchor.getBoundingClientRect();
  const body = editor.getRootElement()?.getBoundingClientRect();

  if (
    !body ||
    point.x < bounds.left ||
    point.x > bounds.right ||
    point.y < bounds.top ||
    point.y > bounds.bottom
  )
    return null;

  const blocks = $getRoot()
    .getChildren()
    .filter($isContentBlock)
    .flatMap((node) => {
      const element = editor.getElementByKey(node.getKey());

      return element?.getClientRects().length
        ? [{ node, bounds: element.getBoundingClientRect() }]
        : [];
    });

  const index = blocks.findIndex((block) => point.y < (block.bounds.top + block.bounds.bottom) / 2);
  const before = index !== -1;
  const target = before ? blocks[index] : blocks.at(-1);

  if (!target || !$canDrop($getNodeByKey(sourceKey), target.node, before)) return null;

  const previous = before ? blocks[index - 1] : null;

  const y = before
    ? previous
      ? (previous.bounds.bottom + target.bounds.top) / 2
      : target.bounds.top
    : target.bounds.bottom + 8;

  return {
    key: target.node.getKey(),
    before,
    line: { top: y - bounds.top - 1.5, left: body.left - bounds.left, width: body.width },
  };
}

export function $dropPageBlock(sourceKey: string, at: PageDrop) {
  const source = $getNodeByKey(sourceKey);
  const target = $getNodeByKey(at.key);

  if (!source || !target || !$canDrop(source, target, at.before)) return;
  $addUpdateTag(HISTORY_PUSH_TAG);

  if (at.before) target.insertBefore(source);
  else target.insertAfter(source);
}
