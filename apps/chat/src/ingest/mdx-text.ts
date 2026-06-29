import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MdNode[];
  attributes?: Array<{ type: string; name?: string; value?: unknown }>;
}

// JSX attributes that carry presentation/plumbing, not content — never embed them.
const SKIP_ATTRS = new Set([
  "classname",
  "class",
  "href",
  "src",
  "style",
  "id",
  "target",
  "rel",
  "variant",
  "size",
  "emphasis",
  "key",
  "tel",
  "aria-label",
  "arialabel",
]);

// Concatenate the human-readable content of a node: text nodes, content-bearing
// JSX string attributes (title/label/number…, NOT className/href/variant), and
// children — recursively.
function inlineText(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode")
    return node.value ?? "";
  let out = "";
  for (const attr of node.attributes ?? []) {
    if (attr.type !== "mdxJsxAttribute" || typeof attr.value !== "string")
      continue;
    if (SKIP_ATTRS.has((attr.name ?? "").toLowerCase())) continue;
    if (/^(tel:|mailto:|https?:|\/)/.test(attr.value)) continue;
    out += `${attr.value} `;
  }
  for (const child of node.children ?? []) out += inlineText(child);
  return out;
}

/**
 * Pull the searchable content out of an `.mdx` source as Markdown with ATX
 * headings preserved, so the existing heading-split chunker consumes it
 * unchanged. Prose, JSX-element children, and content props all come through;
 * presentation attributes and data a component only *references*
 * (e.g. `data={SHELTERS}`) are intentionally absent.
 */
export function extractMdxText(source: string): string {
  const tree = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .parse(source) as unknown as MdNode;
  const blocks: string[] = [];
  for (const node of tree.children ?? []) {
    if (node.type === "heading") {
      blocks.push(`${"#".repeat(node.depth ?? 2)} ${inlineText(node).trim()}`);
    } else {
      const text = inlineText(node).replace(/\s+/g, " ").trim();
      if (text) blocks.push(text);
    }
  }
  return blocks.join("\n\n");
}
