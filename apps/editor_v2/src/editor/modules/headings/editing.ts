import { $isHeadingNode } from "@lexical/rich-text";
import { $createParagraphNode, type ElementNode, type RangeSelection } from "lexical";
import { $paragraphBefore } from "../formatting/editing";

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
