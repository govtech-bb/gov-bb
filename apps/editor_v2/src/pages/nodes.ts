import { ElementNode, type SerializedElementNode, type NodeKey } from "lexical";

import type { PageMarkdownComponent } from "@govtech-bb/govbbmarkd";

/** Start is retained only for existing serialized editor states and HTML markers. */
export type PageComponentKind = PageMarkdownComponent["kind"] | "start";

/** Editable fields may be incomplete; the Markdown boundary validates authored components. */
export type PageComponentAttributes = {
  summary?: string;
  href?: string;
  variant?: string;
  form?: string;
  target?: "form";
  caption?: string;
  rowHeaders?: "first" | "none";
  numericColumns?: readonly number[];
  summaryKey?: string;
};

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
  /** Labels the editing surface without inserting authored body text. */
  decorateElement(element: HTMLElement): void {
    element.dataset.pageComponent = this.__kind;

    const label =
      this.__attributes.summary ?? this.__attributes.caption ?? this.__attributes.summaryKey;

    if (label !== undefined) element.dataset.summary = label;

    if (this.__kind === "start" || this.__kind === "action")
      element.dataset.destination =
        this.__attributes.href ?? this.__attributes.form ?? "Linked form";

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
  /** Editing operations stay inside containers; actions remain editable inline labels. */
  override isShadowRoot(): boolean {
    return this.__kind !== "action" && this.__kind !== "start";
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
