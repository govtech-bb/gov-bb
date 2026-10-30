import { decodeHTMLAttribute, decodeHTMLStrict, encodeXML } from "entities";
import type { PhrasingContent, RootContent } from "mdast";
import { isSafeContentUrl } from "#govbbmarkd/content-url";

function startLabel(
  nodes: readonly RootContent[],
): PhrasingContent[] | undefined {
  const root: PhrasingContent[] = [];
  let parent = { tag: "", children: root };
  const stack: (typeof parent)[] = [];

  for (const node of nodes) {
    if (
      node.type === "text" ||
      node.type === "inlineCode" ||
      node.type === "break"
    )
      parent.children.push(node);
    else if (
      node.type === "strong" ||
      node.type === "emphasis" ||
      node.type === "delete"
    ) {
      const children = startLabel(node.children);

      if (!children) return;
      parent.children.push({ ...node, children });
    } else if (node.type === "html") {
      if (/^<br\s*\/?\s*>$/i.test(node.value)) {
        parent.children.push({ type: "break" });

        continue;
      }

      const match = /^<(\/?)(strong|em|del|code)>$/i.exec(node.value);

      if (!match || !match[2]) return;
      const tag = match[2].toLowerCase();

      if (!match[1]) {
        stack.push(parent);
        parent = { tag, children: [] };
      } else {
        const ancestor = stack.pop();
        if (!ancestor || parent.tag !== tag) return;
        const children = ancestor.children;

        if (tag === "code") {
          if (!parent.children.every((child) => child.type === "text")) return;
          children.push({
            type: "inlineCode",
            value: parent.children.map((child) => child.value).join(""),
          });
        } else
          children.push({
            type:
              tag === "strong"
                ? "strong"
                : tag === "em"
                  ? "emphasis"
                  : "delete",
            children: parent.children,
          });
        parent = ancestor;
      }
    } else return;
  }

  return stack.length === 0 ? root : undefined;
}

function startText(value: string) {
  // These characters must remain literal even when the anchor is parsed as inline Markdown.
  return encodeXML(value).replace(
    /[\\`*_[\]~:\r\n]/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
}

function startLabelHtml(node: RootContent): string {
  if (node.type === "text") return startText(node.value);

  if (node.type === "inlineCode")
    return `<code>${startText(node.value)}</code>`;

  if (
    node.type === "break" ||
    (node.type === "html" && /^<br\s*\/?\s*>$/i.test(node.value))
  )
    return "<br>";

  if (
    node.type === "strong" ||
    node.type === "emphasis" ||
    node.type === "delete"
  ) {
    const tag =
      node.type === "strong"
        ? "strong"
        : node.type === "emphasis"
          ? "em"
          : "del";

    return `<${tag}>${node.children.map(startLabelHtml).join("")}</${tag}>`;
  }

  throw new Error(
    "This Start button label contains content that cannot be saved as inline text",
  );
}

/** @deprecated Reads retained start-link HTML; new starts use action directives with form or target attributes. */
export function parseLegacyPageStartLink(
  node: RootContent,
): { label: PhrasingContent[]; href?: string } | undefined {
  let value: string;
  let content: readonly RootContent[] | undefined;

  if (node.type === "paragraph") {
    const first = node.children[0];
    const last = node.children.at(-1);

    if (
      first?.type !== "html" ||
      last?.type !== "html" ||
      last.value !== "</a>"
    )
      return;

    value = `${first.value}</a>`;
    content = node.children.slice(1, -1);
  } else if (node.type === "html") value = node.value;
  else return;

  const match =
    /^<a\s+data-start-link(?:\s+href=(?:"([^"<>]*)"|'([^'<>]*)'))?\s*>([\s\S]*)<\/a>$/i.exec(
      value,
    );

  if (!match || match[3] === undefined) return;

  const encodedHref = match[1] ?? match[2];
  const href =
    encodedHref === undefined ? undefined : decodeHTMLAttribute(encodedHref);

  if (href && !isSafeContentUrl(href)) return;

  if (!content) {
    content = match[3]
      .split(/(<[^>]*>)/)
      .map((part) =>
        part.startsWith("<")
          ? { type: "html", value: part }
          : { type: "text", value: decodeHTMLStrict(part) },
      );
  }

  const label = startLabel(content);

  if (!label) return;

  return { label, ...(href !== undefined && { href }) };
}

/** @deprecated Preserves existing HTML start markers during visual edits; new content uses stringifyContentMarkdown with an action directive. */
export function serializeLegacyPageStartLink(
  label: readonly RootContent[],
  href?: string,
): string {
  return `<a data-start-link${href === undefined ? "" : ` href="${encodeXML(href)}"`}>${label.map(startLabelHtml).join("")}</a>`;
}
