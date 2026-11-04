import type { RootContent } from "mdast";

/** A line break as a page writes it in HTML: `<br>`, `<br/>` or `<br />`. */
export const HTML_BREAK = /<br\s*\/?\s*>/i;

/** Raw HTML that is a line break and nothing else, as Markdown reads a page's `<br>`. */
export const isHtmlBreak = (node: RootContent): boolean =>
  node.type === "html" && HTML_BREAK.exec(node.value)?.[0] === node.value;
