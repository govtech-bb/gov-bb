import type { SerializedEditorState, SerializedElementNode } from "lexical";
import { isScalar, isSeq, parseDocument } from "yaml";

export type SerializedPageMetadata = SerializedElementNode & {
  yaml: string;
  original: string;
  fingerprint: string;
  blocks?: OriginalBlock[];
};

/** A top-level block of the Markdown a page was opened from: what the editor exports it as, and where its text is. */
export type OriginalBlock = { key: string; start: number; end: number };

export type PageMetadata = {
  title?: string;
  description?: string;
  lede?: string;
  form_id?: string;
  category?: string;
  categories?: string[];
  subcategory?: string;
  visibility?: string;
  publish_date?: string;
  url?: string;
};

export function pageMetadataFromYaml(yaml: string): PageMetadata {
  const document = parseDocument(yaml);
  const metadata: PageMetadata = {};

  for (const key of [
    "title",
    "description",
    "lede",
    "form_id",
    "category",
    "subcategory",
    "visibility",
    "publish_date",
    "url",
  ] as const) {
    const value = document.get(key);

    if (typeof value === "string") metadata[key] = value;
  }

  const categories = document.get("categories");

  if (isSeq(categories)) {
    const values = categories.items.map((item) => (isScalar(item) ? item.value : undefined));

    if (values.every((value): value is string => typeof value === "string"))
      metadata.categories = values;
  }

  return metadata;
}

/** The metadata an editor state holds as YAML on its page-metadata node, read without converting the page. */
export function stateMetadata(state: SerializedEditorState) {
  const node = state.root.children.find((child) => child.type === "page-metadata");

  // SAFETY: only PageMetadataNode has this type, and its exportJSON writes a SerializedPageMetadata
  return node && pageMetadataFromYaml((node as SerializedPageMetadata).yaml);
}
