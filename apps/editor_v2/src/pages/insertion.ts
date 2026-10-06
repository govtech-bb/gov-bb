import {
  $createParagraphNode,
  $addUpdateTag,
  HISTORY_PUSH_TAG,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isRootNode,
  type LexicalNode,
  type ElementNode,
} from "lexical";
import { $isListItemNode } from "@lexical/list";
import type { EditorAction } from "../editor/core/actions";
import { PageMetadataNode } from "./metadata";

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

export function pageInsertAction(
  id: string,
  title: string,
  create: () => ElementNode,
  presentation: Pick<EditorAction, "group" | "description" | "icon" | "order"> = { group: "Text" },
): EditorAction {
  return {
    id,
    title,
    ...presentation,
    $available: ({ target }) => {
      if (target instanceof PageMetadataNode) return false;

      for (const parent of target.getParents()) {
        if (parent.getType() === "tablecell" && id !== "page-paragraph") return false;

        if (
          parent.getType() === "quote" &&
          ![
            "page-paragraph",
            "page-quote",
            "page-bullet-list",
            "page-number-list",
            "page-h1",
            "page-h2",
            "page-h3",
            "page-h4",
            "page-h5",
            "page-h6",
          ].includes(id)
        )
          return false;
      }

      return true;
    },
    $execute({ target }) {
      $addUpdateTag(HISTORY_PUSH_TAG);
      const node = create();

      if ($isListItemNode(target)) target.append(node);
      else if (target.getTextContent() === "" && target.getType() === "paragraph")
        target.replace(node);
      else target.insertAfter(node);

      if (node.getType() === "page-rule") {
        const paragraph = $createParagraphNode();
        node.insertAfter(paragraph);
        paragraph.select();
      } else node.selectStart();
    },
  };
}
