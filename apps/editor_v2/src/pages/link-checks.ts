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

/** Collect internal links and Start buttons recursively; fragments and external destinations need no page lookup. */
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

    if (url && !/^[#?]/.test(url)) {
      const target = URL.parse(url, base);

      if (
        target &&
        (target.protocol === "https:" || target.protocol === "http:") &&
        (target.hostname === "www.gov.bb" || target.hostname === "gov.bb") &&
        !target.port
      )
        links.push({
          path,
          text: linkText(node).replace(/\s+/g, " ").trim() || url,
          url,
          target: target.pathname.replace(/\/+$/, "") || "/",
        });
    }

    node.children?.forEach((child, index) => visit(child, [...path, index]));
  };

  visit(state.root, []);

  return links;
}
