import { $createParagraphNode, type LexicalNode } from "lexical";

/** Text blocks end on Enter: the next line is a plain text block. */
export function $paragraphAfter(node: LexicalNode, restoreSelection: boolean) {
  const paragraph = $createParagraphNode();
  node.insertAfter(paragraph, restoreSelection);

  return paragraph;
}
