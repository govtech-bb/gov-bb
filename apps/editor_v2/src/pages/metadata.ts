import { $getRoot, ElementNode, type NodeKey } from "lexical";
import { isMap, parseDocument } from "yaml";
import {
  pageMetadataFromYaml,
  type OriginalBlock,
  type PageMetadata,
  type SerializedPageMetadata,
} from "./metadata-yaml";

export class PageMetadataNode extends ElementNode {
  __yaml: string;
  __original: string;
  __fingerprint: string;
  __blocks: readonly OriginalBlock[];

  static override getType() {
    return "page-metadata";
  }
  static override clone(node: PageMetadataNode) {
    return new PageMetadataNode(
      node.__yaml,
      node.__original,
      node.__fingerprint,
      node.__blocks,
      node.__key,
    );
  }
  constructor(
    yaml = "",
    original = "",
    fingerprint = "",
    blocks: readonly OriginalBlock[] = [],
    key?: NodeKey,
  ) {
    super(key);
    this.__yaml = yaml;
    this.__original = original;
    this.__fingerprint = fingerprint;
    this.__blocks = blocks;
  }
  static override importJSON(value: SerializedPageMetadata) {
    return new PageMetadataNode(value.yaml, value.original, value.fingerprint, value.blocks);
  }
  override exportJSON(): SerializedPageMetadata {
    return {
      ...super.exportJSON(),
      type: "page-metadata",
      version: 1,
      yaml: this.__yaml,
      original: this.__original,
      fingerprint: this.__fingerprint,
      blocks: [...this.__blocks],
    };
  }
  override createDOM() {
    const element = document.createElement("span");
    element.hidden = true;

    return element;
  }
  override updateDOM() {
    return false;
  }
  override isInline() {
    return false;
  }
  override excludeFromCopy() {
    return true;
  }
  override getTextContent() {
    return "";
  }
  getYaml() {
    return this.getLatest().__yaml;
  }
  setYaml(yaml: string) {
    this.getWritable().__yaml = yaml;
  }
  setOriginal(original: string, fingerprint: string, blocks: readonly OriginalBlock[]) {
    const writable = this.getWritable();
    writable.__original = original;
    writable.__fingerprint = fingerprint;
    writable.__blocks = blocks;
  }
}

export function $pageMetadataNode() {
  const metadata = $getRoot()
    .getChildren()
    .find((node) => node instanceof PageMetadataNode);

  if (!(metadata instanceof PageMetadataNode)) throw new Error("Page metadata is missing");

  return metadata;
}

export function $pageMetadata() {
  return pageMetadataFromYaml($pageMetadataNode().getYaml());
}

export function $setPageMetadata(values: PageMetadata) {
  const node = $pageMetadataNode();
  const document = parseDocument(node.getYaml());

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) document.delete(key);
    else document.set(key, value);
  }

  node.setYaml(document.toString());
}

export function validateMetadata(yaml: string) {
  const document = parseDocument(yaml, { uniqueKeys: true });

  if (document.errors.length) throw new Error(document.errors[0]!.message);

  if (document.contents && !isMap(document.contents))
    throw new Error("Page metadata must be a YAML mapping");

  for (const key of ["title", "description", "lede", "form_id", "url"]) {
    const value = document.get(key);

    if (value !== undefined && value !== null && typeof value !== "string")
      throw new Error(`${key} must be text`);
  }
}
