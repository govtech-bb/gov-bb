import {
  $createParagraphNode,
  $addUpdateTag,
  $copyNode,
  HISTORY_PUSH_TAG,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isParagraphNode,
  $isRootNode,
  type LexicalNode,
  type ElementNode,
} from "lexical";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { $isQuoteNode } from "@lexical/rich-text";
import type { ActionRequest, EditorAction } from "../editor/core/actions";
import { PageMetadataNode } from "./metadata";
import { PageComponentNode } from "./nodes";

/**
 * Where a chosen block goes, as an action request's mode. "line", the default, is the caret's line, from the "/"
 * menu: an empty line becomes the block, and a line with text has the block after it, in the same list item or
 * Notice. "below" and "above" are beside a block on the page, never inside it, from "+" and Add content.
 */
export type PagePlace = "line" | "below" | "above";

/** The block on the page holding a node: a child of the root, other than the hidden metadata. */
export function $rootBlock(node: LexicalNode | null): LexicalNode | null {
  while (node?.getParent() && !$isRootNode(node.getParent())) node = node.getParent();

  return node && !$isRootNode(node) && !(node instanceof PageMetadataNode) ? node : null;
}

export function $pageInsertionTarget(): ElementNode | null {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return null;
  let node: LexicalNode | null = selection.anchor.getNode();

  while (node && !$isRootNode(node)) {
    if (
      $isElementNode(node) &&
      (node.getType() === "paragraph" || node.getType() === "heading" || $isListItemNode(node))
    )
      return node;
    node = node.getParent();
  }

  return null;
}

// The blocks an empty line leaves before a block takes its place. A Details and a table cell keep theirs
const $leavable = (node: LexicalNode) =>
  $isListNode(node) ||
  $isListItemNode(node) ||
  $isQuoteNode(node) ||
  (node instanceof PageComponentNode && node.getKind() === "notice");

/** The caret's line holds nothing once what was typed to open the menu has gone. */
const $emptyLine = (target: LexicalNode, request: ActionRequest) =>
  target.getTextContent() === (request.typed ?? "");

/**
 * Moves a line out of the blocks around it that `$leaves` names, splitting them where it was, so the blocks before and
 * after it stay where they are. A list item goes on as a line of text, with its text.
 */
export function $liftLine(line: ElementNode, $leaves: (node: LexicalNode) => boolean): ElementNode {
  let node = line;

  if ($isListItemNode(node)) {
    const text = $createParagraphNode();
    const split = !!node.getNextSibling();

    // Lexical splits the list around it. The items after go on from the item's number, as it's no longer one
    node.insertAfter(text);
    const rest = text.getNextSibling();

    if (split && $isListNode(rest)) rest.setStart(node.getValue());
    text.append(...node.getChildren());
    node.remove();
    node = text;
  }

  for (let parent = node.getParent(); parent && $leaves(parent); parent = node.getParent()) {
    const rest = node.getNextSiblings();

    if (rest.length) parent.insertAfter($copyNode(parent).append(...rest));
    parent.insertAfter(node);

    if (parent.isEmpty()) parent.remove();
  }

  return node;
}

/** The element a block chosen for this request would sit in, for the rules on what each one holds. */
function $destination(target: LexicalNode, request: ActionRequest) {
  if (request.mode === "below" || request.mode === "above") return $rootBlock(target)?.getParent();

  if (!$emptyLine(target, request)) return $isListItemNode(target) ? target : target.getParent();
  let parent = target.getParent();

  while (parent && $leavable(parent)) parent = parent.getParent();

  return parent;
}

/** Puts a new block where a request says it goes (see PagePlace), once what was typed to ask for it has gone. */
export function $placePageBlock(block: ElementNode, target: LexicalNode, request: ActionRequest) {
  if (request.mode === "below" || request.mode === "above") {
    const beside = $rootBlock(target) ?? target;

    if ($isParagraphNode(beside) && beside.isEmpty()) beside.replace(block);
    else if (request.mode === "above") beside.insertBefore(block);
    else beside.insertAfter(block);
  } else if ($isElementNode(target) && !target.getTextContent())
    $liftLine(target, $leavable).replace(block);
  else if ($isListItemNode(target)) target.append(block);
  else target.insertAfter(block);
}

// What a quote can hold in Markdown: text, headings and lists
const quotable = new Set([
  "page-paragraph",
  "page-quote",
  "page-bullet-list",
  "page-number-list",
  "page-h2",
  "page-h3",
  "page-h4",
]);

export function pageInsertAction(
  id: string,
  title: string,
  create: () => ElementNode,
  presentation: Pick<
    EditorAction,
    "group" | "description" | "icon" | "order" | "searchOnly" | "aliases" | "markdown"
  > = { group: "Text" },
): EditorAction {
  return {
    id,
    title,
    ...presentation,
    $available: ({ target, request }) => {
      if (target instanceof PageMetadataNode) return false;
      const destination = $destination(target, request);

      for (const parent of destination ? [destination, ...destination.getParents()] : []) {
        if (parent.getType() === "tablecell" && id !== "page-paragraph") return false;

        if ($isQuoteNode(parent) && !quotable.has(id)) return false;
      }

      return true;
    },
    $execute({ target, request }) {
      $addUpdateTag(HISTORY_PUSH_TAG);
      const node = create();
      $placePageBlock(node, target, request);

      if (node.getType() === "page-rule") {
        const paragraph = $createParagraphNode();
        node.insertAfter(paragraph);
        paragraph.select();
      } else node.selectStart();
    },
  };
}
