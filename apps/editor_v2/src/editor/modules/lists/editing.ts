import { $createParagraphNode, type ElementNode, type RangeSelection } from "lexical";
import { $depth, $setDepth } from "../../core/document-state";
import { $createListLine, $isListLine, BulletNode } from "./nodes";
import { $toText } from "../formatting/editing";

export function $enterList(
  block: ElementNode,
  _selection: RangeSelection,
  atStart: boolean,
): boolean {
  if (!$isListLine(block)) return false;

  if (block.isEmpty()) {
    block.replace($setDepth($createParagraphNode(), $depth(block))).selectStart();

    return true;
  }

  if (!atStart) return false;
  block.insertBefore(
    $setDepth($createListLine(block instanceof BulletNode ? "bullet" : "number"), $depth(block)),
  );

  return true;
}

export function $exitList(block: ElementNode): boolean {
  if (!$isListLine(block) || block.isEmpty()) return false;
  $toText(block);

  return true;
}
