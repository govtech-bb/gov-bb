import { $createParagraphNode, type ElementNode, type ParagraphNode } from "lexical";
import { $depth, $setDepth, $settings, $setSettings } from "../canvas/block-state";

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
