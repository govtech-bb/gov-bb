import type { Element, Root, RootContent } from "hast";

/** A rendered heading, including the same duplicate-safe id used by its permalink. */
export interface MarkdownHeading {
  readonly id: string;
  readonly depth: number;
  readonly text: string;
}

/** Readable text following a heading, or the preamble when heading is null. */
export interface MarkdownSection {
  readonly heading: MarkdownHeading | null;
  readonly text: string;
}

/** Document structure, without search ranking, chunk ids, or embedding policy. */
export interface MarkdownDocument {
  readonly text: string;
  readonly outline: readonly MarkdownHeading[];
  readonly sections: readonly MarkdownSection[];
}

const BLOCKS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "buttons",
  "caption",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "notice",
  "ol",
  "p",
  "section",
  "show-hide",
  "summary",
  "summary-item",
  "summary-list",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function ignoredContent(node: Element): boolean {
  return (
    ["pre", "script", "style", "template"].includes(node.tagName) ||
    node.properties.ariaHidden === "true" ||
    node.properties.dataFootnoteRef !== undefined ||
    node.properties.dataFootnoteBackref !== undefined ||
    (node.properties.id === "footnote-label" &&
      Array.isArray(node.properties.className) &&
      node.properties.className.includes("sr-only"))
  );
}

function componentLabel(node: Element): string {
  const label =
    node.tagName === "show-hide"
      ? node.properties.summary
      : node.tagName === "summary-item"
        ? node.properties.dataSummaryKey
        : node.tagName === "table"
          ? node.properties.dataCaption
          : undefined;
  return typeof label === "string" ? label + " " : "";
}

function headingText(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element" || ignoredContent(node)) return "";
  if (node.tagName === "br") return " ";
  return node.children.map(headingText).join("");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Reads the compiled tree, so outline ids and component labels cannot drift from rendering. */
export function readMarkdownDocument(tree: Root): MarkdownDocument {
  let current: { heading: MarkdownHeading | null; parts: string[] } = {
    heading: null,
    parts: [],
  };
  const sections = [current];

  function visit(node: RootContent): void {
    if (node.type === "text") {
      current.parts.push(node.value);
      return;
    }
    if (node.type !== "element" || ignoredContent(node)) return;

    if (/^h[1-6]$/.test(node.tagName)) {
      const id = node.properties.id;
      if (typeof id !== "string")
        throw new Error("GovBB Markdown: compiled heading has no id");
      current = {
        heading: {
          id,
          depth: Number(node.tagName.slice(1)),
          text: normalizeText(headingText(node)),
        },
        parts: [],
      };
      sections.push(current);
      return;
    }

    const block =
      BLOCKS.has(node.tagName) ||
      node.tagName === "link-button" ||
      (node.tagName === "a" && node.properties.dataStartLink !== undefined);
    if (block) current.parts.push(" ");
    current.parts.push(componentLabel(node));
    for (const child of node.children) visit(child);
    if (block) current.parts.push(" ");
  }

  for (const child of tree.children) visit(child);
  const readable = sections
    .map(({ heading, parts }) => ({
      heading,
      text: normalizeText(parts.join("")),
    }))
    .filter((section) => section.heading !== null || section.text !== "");
  return {
    text: readable
      .flatMap((section) => [section.heading?.text ?? "", section.text])
      .filter(Boolean)
      .join(" "),
    outline: readable.flatMap((section) =>
      section.heading ? [section.heading] : [],
    ),
    sections: readable,
  };
}
