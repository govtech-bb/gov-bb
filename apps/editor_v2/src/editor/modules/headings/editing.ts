import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import { $createParagraphNode, type ElementNode, type RangeSelection } from "lexical";
import { $paragraphBefore, type ContentShortcuts } from "../formatting/editing";

export const headingShortcuts: ContentShortcuts = {
  "# ": () => [$createHeadingNode("h1")],
  "## ": () => [$createHeadingNode("h2")],
  "### ": () => [$createHeadingNode("h3")],
};

/** A heading split continues in body text; Enter at its start opens a line above it. */
export function $enterHeading(
  block: ElementNode,
  selection: RangeSelection,
  atStart: boolean,
): boolean {
  if (!$isHeadingNode(block) || block.isEmpty()) return false;

  if (atStart) $paragraphBefore(block);
  else {
    const rest = selection.insertParagraph();

    if ($isHeadingNode(rest)) rest.replace($createParagraphNode(), true);
  }

  return true;
}
