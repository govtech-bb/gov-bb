import { $createParagraphNode, type LexicalNode } from "lexical";
import { $depth } from "./document-state";

/** Text blocks end on Enter: the next line is a plain text block. */
export function $paragraphAfter(node: LexicalNode, restoreSelection: boolean) {
  const paragraph = $createParagraphNode();
  node.insertAfter(paragraph, restoreSelection);

  return paragraph;
}

/** Following flat siblings nested under a block; the caller decides which blocks are hosts. */
export function $deeperSiblings(block: LexicalNode): LexicalNode[] {
  const result: LexicalNode[] = [];

  for (
    let next = block.getNextSibling();
    next && $depth(next) > $depth(block);
    next = next.getNextSibling()
  )
    result.push(next);

  return result;
}
