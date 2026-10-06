import {
  $addUpdateTag,
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalNode,
} from "lexical";
import type { ReactNode } from "react";
import { $depth, $depthAt, $headEnd, $isPageBreak, $pageType, $setDepth } from "./nodes";

export type Entry = {
  renderPreview?: import("../../editor/modules/formatting/insertion").ContentEntry["renderPreview"];
  id: string;
  title: string;
  icon: ReactNode;
  /** What the block is for, shown in the insert modal. */
  description: string;

  keywords?: string;
  /** The kind $blockKind reports for the block, so the block menu can show the same icon. */
  kind?: string;
  /** What the insert modal's preview draws the block with. */
  sample?: Sample;
  /** Read in the editor each time a menu opens. */
  available?: () => boolean;
  create: () => LexicalNode[];
};

export type Sample = {
  label?: string;
  hint?: string;
  options?: string[];
  text?: string;
  items?: string[];
};

/** Replace an empty text line, otherwise insert after the target. Reserved pages retain their required order. */
export function $insertBlocks(
  nodes: LexicalNode[],
  block: LexicalNode | null | undefined,
  options: { trailingParagraph?: boolean } = {},
) {
  const [first, ...rest] = nodes;
  const pageType = first && $isPageBreak(first) ? $pageType(first) : "questions";

  if (pageType !== "questions") {
    const pages = $getRoot().getChildren().filter($isPageBreak);

    // ponytail: a check-answers page already after confirmation needs moving; insertion leaves that order error for preflight.
    const before =
      pageType === "check-answers"
        ? (pages.find((page) => $pageType(page) === "declaration") ??
          pages.find((page) => $pageType(page) === "confirmation"))
        : pageType === "declaration"
          ? pages.find((page) => $pageType(page) === "confirmation")
          : undefined;

    block = before?.getPreviousSibling() ?? $getRoot().getLastChild();
  }

  if (!block || !first) return;
  $addUpdateTag(HISTORY_PUSH_TAG);

  const base =
    pageType !== "questions"
      ? 0
      : $isParagraphNode(block) && block.isEmpty()
        ? $depth(block)
        : $depthAt(block);

  for (const node of nodes) $setDepth(node, base + $depth(node));

  let last =
    $isParagraphNode(block) && block.isEmpty()
      ? block.replace(first)
      : $headEnd(block).insertAfter(first);

  for (const node of rest) last = last.insertAfter(node);

  if (pageType === "check-answers") {
    const selection = $createNodeSelection();
    selection.add(first.getKey());
    $setSelection(selection);

    return;
  }

  if (pageType === "declaration" && $isElementNode(last)) {
    last.selectEnd();

    return;
  }

  // Somewhere to keep typing after a non-text block
  if ($isDecoratorNode(last) && options.trailingParagraph !== false) {
    const next = last.getNextSibling();
    last =
      $isParagraphNode(next) && next.isEmpty() ? next : last.insertAfter($createParagraphNode());
  }

  const caret = nodes.find($isElementNode) ?? last;

  if ($isElementNode(caret)) caret.selectStart();
}
