import type { Root, RootContent } from "mdast";
import {
  isPageDirective,
  parseContentMarkdown,
  parsePageComponent,
} from "#govbbmarkd/page-markdown";

/** A data collection's record that a page names, in a fact or a contact block. */
export interface RecordReference {
  collection: string;
  record: string;
}

/**
 * The records a page's Markdown names, in its facts and contact blocks, once
 * each and in order: what a record's "used on" list looks for. One still to be
 * chosen, with no record, names none.
 */
export function recordReferences(source: string): RecordReference[] {
  const found = new Map<string, RecordReference>();
  const visit = (node: Root | RootContent) => {
    if (node.type !== "root" && isPageDirective(node)) {
      const parsed = parsePageComponent(node);
      if (
        parsed.ok &&
        (parsed.value.kind === "fact" || parsed.value.kind === "contact") &&
        parsed.value.record
      ) {
        const { collection, record } = parsed.value;
        found.set(`${collection}/${record}`, { collection, record });
      }
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(parseContentMarkdown(source).root);
  return [...found.values()];
}
