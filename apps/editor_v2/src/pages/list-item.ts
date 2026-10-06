import { ListItemNode, $isListItemNode, type SerializedListItemNode } from "@lexical/list";
import type { LexicalNode } from "lexical";

/** Preserve separate paragraphs in service instructions instead of merging their text. */
export class PageListItemNode extends ListItemNode {
  static override getType() {
    return "page-listitem";
  }
  static override clone(node: PageListItemNode) {
    return new PageListItemNode(node.__value, node.__checked, node.__key);
  }
  static override importJSON(value: SerializedListItemNode) {
    return new PageListItemNode(value.value, value.checked).updateFromJSON(value);
  }
  override exportJSON(): SerializedListItemNode {
    return { ...super.exportJSON(), type: "page-listitem", version: 1 };
  }
  override canMergeWith(node: LexicalNode) {
    return $isListItemNode(node);
  }
}
