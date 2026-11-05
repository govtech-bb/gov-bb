import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $getRoot, $isParagraphNode, type ElementNode } from "lexical";
import { $caretLine, SlashMenu } from "@/editor/react";
import { $pageInsertionTarget } from "./insertion";
import { PageMetadataNode } from "./metadata";
import { $blockKind } from "./blocks/node";

/** What an empty line on a page says, and the editor's description for screen readers. */
export const startWriting = "Start writing, or type / to add content.";

/** The hint on the caret's empty line, worded for the block it's in. A new page shows it on its first line. */
function $pageHint(focused: boolean): readonly [ElementNode, string] | null {
  const line = focused ? $caretLine() : null;

  if (!line) {
    const content = $getRoot()
      .getChildren()
      .filter((node) => !(node instanceof PageMetadataNode));

    return content.length === 1 && $isParagraphNode(content[0]) && content[0].isEmpty()
      ? [content[0], startWriting]
      : null;
  }

  const holder = $isListItemNode(line) ? line : line.getParent();

  // A heading names its level instead, and a table cell is too narrow for words
  if ($isHeadingNode(line) || holder?.getType() === "tablecell") return null;

  if ($isListItemNode(holder)) return [line, "List item"];

  if ($isQuoteNode(holder)) return [line, "Quote"];

  // A component that holds lines is named by its block
  const name = $blockKind(holder)?.name;

  return [line, name ?? startWriting];
}

/** The page's "/" menu: it opens on any line of text, in a list item or a component too, and inserts at the caret. */
export function PageSlashMenu() {
  return (
    <SlashMenu
      $target={$pageInsertionTarget}
      $hint={$pageHint}
      label="Insert page content"
      empty="No content blocks match your search."
      // page-insert-menu: the tests' hook, shared with "+" and Add content's menu
      className="page-insert-menu"
    />
  );
}
