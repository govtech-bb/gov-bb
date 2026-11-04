import {
  decodeHTMLAttribute,
  decodeHTMLStrict,
  escapeAttribute,
  escapeText,
} from "entities";
import type { PhrasingContent, RootContent } from "mdast";
import { HTML_BREAK, isHtmlBreak } from "#govbbmarkd/html-break";

/** A retained highlight: its title, and its text with any line breaks. */
export interface LegacyHighlight {
  readonly title: string;
  readonly text: PhrasingContent[];
}

const HIGHLIGHT = new RegExp(
  String.raw`<highlight\s+title="([^"]*)"\s*>((?:[^<]|${HTML_BREAK.source})*)<\/highlight>`,
  "gi",
);

// HTML collapses these, as landing draws the text; a non-breaking space stays
const collapse = (value: string) => value.replace(/[\t\n\f\r ]+/g, " ");

function highlightText(body: string): PhrasingContent[] {
  return body.split(HTML_BREAK).flatMap((part, index) => {
    const value = collapse(decodeHTMLStrict(part));
    const text: PhrasingContent[] = value ? [{ type: "text", value }] : [];

    return index ? [{ type: "break" }, ...text] : text;
  });
}

/** @deprecated Reads retained highlights HTML so its pages stay editable; no replacement directive is approved. */
export function parseLegacyHighlights(
  node: RootContent,
): LegacyHighlight[] | undefined {
  if (node.type !== "html") return;

  const inner = /^<highlights>([\s\S]*)<\/highlights>$/i.exec(node.value)?.[1];

  // Only highlights, with nothing but whitespace between them
  if (
    inner === undefined ||
    !/^[\t\n\f\r ]*$/.test(inner.replace(HIGHLIGHT, ""))
  )
    return;

  const highlights = [...inner.matchAll(HIGHLIGHT)].map(
    ([, title = "", body = ""]) => ({
      title: decodeHTMLAttribute(title),
      text: highlightText(body),
    }),
  );

  return highlights.length ? highlights : undefined;
}

function highlightHtml(node: RootContent): string {
  if (node.type === "text") return escapeText(collapse(node.value));

  if (node.type === "break" || isHtmlBreak(node)) return "<br>";

  throw new Error("A highlight can only hold plain text and line breaks");
}

/** @deprecated Writes retained highlights back as the HTML landing renders; no replacement directive is approved. */
export function serializeLegacyHighlights(
  highlights: readonly {
    readonly title: string;
    readonly text: readonly RootContent[];
  }[],
): string {
  return [
    "<highlights>",
    ...highlights.map(
      ({ title, text }) =>
        `<highlight title="${escapeAttribute(title)}">${text.map(highlightHtml).join("")}</highlight>`,
    ),
    "</highlights>",
  ].join("\n");
}
