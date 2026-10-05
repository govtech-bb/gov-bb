import { ElementNode, type SerializedElementNode, type NodeKey } from "lexical";

export type PageComponentKind = "notice" | "details" | "actions" | "action" | "start";

export type PageComponentAttributes = { summary?: string; href?: string; variant?: string };

type SerializedPageComponent = SerializedElementNode & {
  kind: PageComponentKind;
  attributes: PageComponentAttributes;
};

export class PageComponentNode extends ElementNode {
  __kind: PageComponentKind;
  __attributes: PageComponentAttributes;
  static override getType() {
    return "page-component";
  }
  static override clone(node: PageComponentNode) {
    return new PageComponentNode(node.__kind, node.__attributes, node.__key);
  }
  constructor(
    kind: PageComponentKind = "notice",
    attributes: PageComponentAttributes = {},
    key?: NodeKey,
  ) {
    super(key);
    this.__kind = kind;
    this.__attributes = { ...attributes };
  }
  static override importJSON(value: SerializedPageComponent) {
    return new PageComponentNode(value.kind, value.attributes).updateFromJSON(value);
  }
  override exportJSON(): SerializedPageComponent {
    return {
      ...super.exportJSON(),
      type: "page-component",
      version: 1,
      kind: this.__kind,
      attributes: this.__attributes,
    };
  }
  getKind() {
    return this.getLatest().__kind;
  }
  getAttributes() {
    return { ...this.getLatest().__attributes };
  }
  setAttributes(attributes: PageComponentAttributes) {
    this.getWritable().__attributes = { ...attributes };
  }
  override createDOM() {
    const element = document.createElement("div");
    this.decorateElement(element);

    return element;
  }
  decorateElement(element: HTMLElement) {
    element.dataset.pageComponent = this.__kind;

    if (this.__kind === "details")
      element.dataset.summary = this.__attributes.summary ?? "More information";

    if (this.__kind === "start" || this.__kind === "action")
      element.dataset.destination = this.__attributes.href ?? "Linked form";

    element.classList.toggle(
      "page-action-secondary",
      this.__kind === "action" && this.__attributes.variant === "secondary",
    );
  }
  override updateDOM(previous: PageComponentNode, element: HTMLElement) {
    if (previous.__kind !== this.__kind || previous.__attributes !== this.__attributes)
      this.decorateElement(element);

    return false;
  }
  override canBeEmpty() {
    return false;
  }
  override isShadowRoot() {
    return this.__kind === "notice" || this.__kind === "details" || this.__kind === "actions";
  }
}

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
