import { ElementNode, type SerializedElementNode } from "lexical";

export class PageRuleNode extends ElementNode {
  static override getType() {
    return "page-rule";
  }
  static override clone(node: PageRuleNode) {
    return new PageRuleNode(node.__key);
  }
  static override importJSON(value: SerializedElementNode) {
    return new PageRuleNode().updateFromJSON(value);
  }
  override createDOM() {
    return document.createElement("hr");
  }
  override updateDOM() {
    return false;
  }
  override exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: "page-rule", version: 1 };
  }
}
