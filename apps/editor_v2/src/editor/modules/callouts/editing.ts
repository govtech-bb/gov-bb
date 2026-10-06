import type { ElementNode } from "lexical";
import { $isCallout } from "./nodes";
import { $paragraphBefore, $toText } from "../formatting/editing";

export function $exitCallout(block: ElementNode): boolean {
  if (!$isCallout(block) || block.isEmpty()) return false;
  $toText(block);

  return true;
}

export function $enterCallout(block: ElementNode, atStart: boolean): boolean {
  return $isCallout(block) && !block.isEmpty() && atStart ? $paragraphBefore(block) : false;
}
