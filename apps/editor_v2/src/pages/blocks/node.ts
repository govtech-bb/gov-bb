import { ElementNode, type LexicalNode, type NodeKey, type SerializedElementNode } from "lexical";

/**
 * The kinds of page component, and the attributes they keep. Each block's file adds its own, so adding a block never
 * edits these lists:
 *
 * ```ts
 * declare module "./node" {
 *   interface PageComponentKinds {
 *     details: true;
 *   }
 *   interface PageComponentAttributes {
 *     summary?: string;
 *   }
 * }
 * ```
 */
export interface PageComponentKinds {}

export type PageComponentKind = keyof PageComponentKinds;

/**
 * The attributes components keep, each added by the block whose components keep it (see PageComponentKinds). They're
 * optional, as editable fields may be incomplete; the Markdown boundary validates authored components.
 */
export interface PageComponentAttributes {}

/** What a kind of component is to the editing around it, which asks for a trait rather than knowing every kind. */
export type BlockTrait =
  /** A button: its label is one line, which Enter goes on below and Turn into leaves alone */
  | "button"
  /** It holds buttons, which Enter goes on below */
  | "buttons"
  /** It holds lines of text, which Enter on its empty last line leaves */
  | "holds-lines"
  /** An empty line in it leaves it when a block takes the line's place */
  | "leavable";

/** How a kind of page component behaves, as its block declares it (see defineBlock). */
export type BlockKind = {
  readonly kind: PageComponentKind;
  /** What the editor calls it where it names it, such as in the hint on an empty line in it. */
  readonly name?: string;
  /** Editing stays inside it, as in a Notice, unless it's a line of inline text, such as a button's label. */
  readonly shadowRoot?: boolean;
  /** It can be emptied and written in again, rather than going with its last character. */
  readonly canBeEmpty?: boolean;
  readonly traits?: readonly BlockTrait[];
  /** Labels its editing surface from its attributes, without inserting authored body text. */
  readonly decorate?: (element: HTMLElement, attributes: PageComponentAttributes) => void;
};

const kinds = new Map<string, BlockKind>();

/** Declares how a kind of component behaves; defineBlock does it for each of a block's kinds. */
export function registerBlockKind(kind: BlockKind) {
  const known = kinds.get(kind.kind);

  if (known && known !== kind) throw new Error(`Conflicting page component kind: ${kind.kind}`);
  kinds.set(kind.kind, kind);
}

type SerializedPageComponent = SerializedElementNode & {
  kind: PageComponentKind;
  attributes: PageComponentAttributes;
};

/** Every block's components, told apart by their kind, so saved pages keep one node type whichever blocks exist. */
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
  decorateElement(element: HTMLElement): void {
    element.dataset.pageComponent = this.__kind;
    kinds.get(this.__kind)?.decorate?.(element, this.__attributes);
  }
  override updateDOM(previous: PageComponentNode, element: HTMLElement) {
    if (previous.__kind !== this.__kind || previous.__attributes !== this.__attributes)
      this.decorateElement(element);

    return false;
  }
  override canBeEmpty() {
    return kinds.get(this.__kind)?.canBeEmpty ?? false;
  }
  override isShadowRoot(): boolean {
    return kinds.get(this.__kind)?.shadowRoot ?? true;
  }
}

/** How a node's kind of component behaves, if it is a component. */
export function $blockKind(node: LexicalNode | null | undefined) {
  return node instanceof PageComponentNode ? kinds.get(node.getKind()) : undefined;
}

/** The node is a component whose kind has this trait. */
export const $hasTrait = (
  node: LexicalNode | null | undefined,
  trait: BlockTrait,
): node is PageComponentNode => !!$blockKind(node)?.traits?.includes(trait);
