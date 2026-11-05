import type { SerializedEditorState, SerializedLexicalNode } from "lexical";

/** An internal link's location in this document snapshot, not a persistent node identity. */
export type InternalPageLink = {
  readonly path: readonly number[];
  readonly text: string;
  readonly url: string;
  readonly target: string;
};

type PageLinkNode = SerializedLexicalNode & {
  children?: PageLinkNode[];
  text?: string;
  url?: string;
  kind?: string;
  attributes?: { href?: string };
};

const linkText = (node: PageLinkNode): string =>
  node.text ?? (node.type === "linebreak" ? " " : (node.children ?? []).map(linkText).join(""));

/**
 * The site pathname a link goes to, or undefined when it needs no page lookup, as fragments and external destinations
 * don't. A bare `#`, which a new button starts with, goes nowhere: its target is no page at all.
 */
function internalTarget(url: string, base: URL) {
  if (url === "#") return "";

  if (/^[#?]/.test(url)) return undefined;
  const target = URL.parse(url, base);

  return target &&
    (target.protocol === "https:" || target.protocol === "http:") &&
    (target.hostname === "www.gov.bb" || target.hostname === "gov.bb") &&
    !target.port
    ? target.pathname.replace(/\/+$/, "") || "/"
    : undefined;
}

/** Collect internal links and Start buttons recursively, and any left at `#`. */
export function collectInternalPageLinks(
  state: SerializedEditorState,
  pageUrl: string,
): InternalPageLink[] {
  const links: InternalPageLink[] = [];
  const base = new URL(pageUrl, "https://www.gov.bb");

  const visit = (node: PageLinkNode, path: number[]) => {
    const url =
      node.type === "link" || node.type === "autolink"
        ? node.url
        : node.type === "page-component" && (node.kind === "start" || node.kind === "action")
          ? node.attributes?.href
          : undefined;

    if (url) {
      const target = internalTarget(url, base);

      if (target !== undefined)
        links.push({ path, text: linkText(node).replace(/\s+/g, " ").trim() || url, url, target });
    }

    node.children?.forEach((child, index) => visit(child, [...path, index]));
  };

  visit(state.root, []);

  return links;
}
