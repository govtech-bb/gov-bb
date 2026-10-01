/**
 * `body_markdown` to the sanitised hast stored beside it, and the one change
 * a read makes to that hast: removing a Start link that leads nowhere public.
 *
 * Compiling on write rather than on read means a page view never parses
 * markdown, and the sanitiser runs where the data lands — the same reason
 * `block-kit`'s rules ran here before. Raw HTML is allowed in because the
 * estate uses it (`<a data-start-link>`, `<details>`, `<highlight>`, …), and
 * is then cut back to the schema below, so a `<script>` or an `onclick`
 * never reaches the table.
 */

import type { Element, ElementContent, Root, RootContent } from "hast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * GitHub's schema, plus the custom elements the estate's markdown uses and
 * `tel:` links, which every phone number in the content is.
 */
const SCHEMA = {
  ...defaultSchema,
  // Heading ids are linked to across pages; prefixing them breaks those.
  clobberPrefix: "",
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "buttons",
    "contact",
    "contacts",
    "highlight",
    "highlights",
    "link-button",
    "muted",
    "notice",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "dataStartLink"],
    contact: ["label", "number", "tel", "emergency"],
    details: [...(defaultSchema.attributes?.details ?? []), "className"],
    div: [...(defaultSchema.attributes?.div ?? []), "className"],
    highlight: ["title"],
    "link-button": ["href", "variant"],
    muted: ["caption"],
    summary: ["className"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "tel"],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, SCHEMA)
  // After the sanitiser, so the ids are v1's (landing ran rehype-slug too):
  // the estate's `#fragment` links between pages were written against them.
  // A heading with an authored id keeps it.
  .use(rehypeSlug);

const isStartLink = (node: Element) =>
  node.tagName === "a" && node.properties.dataStartLink !== undefined;

/** Source positions are dead weight in a stored tree; drop them. */
function withoutPositions<T extends Root | RootContent>(node: T): T {
  delete node.position;
  if ("children" in node) node.children.forEach(withoutPositions);
  return node;
}

/**
 * Compiles a page's markdown. A start link with no `href` of its own is the
 * page's form button, so it is stamped with `form_id` for the renderer to
 * turn into a link into the forms app; an authored `href` wins.
 */
export async function compileMarkdown(
  markdown: string,
  formId: string | null,
): Promise<Root> {
  const hast = await processor.run(processor.parse(markdown));
  const stamp = (nodes: RootContent[]) => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      if (formId && isStartLink(node) && node.properties.href === undefined) {
        node.properties.dataFormId = formId;
      }
      stamp(node.children);
    }
  };
  stamp(hast.children);
  // rehype-raw's parser bookkeeping (`quirksMode`), not content.
  delete hast.data;
  return withoutPositions(hast);
}

const WAYS = /are (\d+) ways|are ([a-zA-Z]+) ways/i;
const WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const containsStartLink = (node: ElementContent): boolean =>
  node.type === "element" &&
  (isStartLink(node) || node.children.some(containsStartLink));

const textOf = (element: Element) =>
  element.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("");

/**
 * A copy of `tree` without its online-application method: the `<li>` that
 * hosts a start link, or the bare link when it is not in a list, with any
 * "There are N ways…" sentence counted down to match.
 *
 * Ported from landing's `rehypeHideStartLinks`, because the estate's markdown
 * was written against it — a page that loses its online method and still says
 * "There are 2 ways to apply" is wrong.
 */
export function hideStartLinks(tree: Root): Root {
  let removed = 0;

  const filter = (children: ElementContent[]): ElementContent[] =>
    children
      .filter((node) => {
        if (node.type !== "element") return true;
        if (
          (node.tagName === "li" && containsStartLink(node)) ||
          isStartLink(node)
        ) {
          removed++;
          return false;
        }
        return true;
      })
      .map((node) =>
        node.type === "element"
          ? { ...node, children: filter(node.children) }
          : node,
      );

  const children = filter(tree.children as ElementContent[]);
  if (removed === 0) return tree;

  const recount = (nodes: ElementContent[]): ElementContent[] =>
    nodes.map((node) => {
      if (node.type !== "element") return node;
      if (node.tagName === "p" && WAYS.test(textOf(node))) {
        const value = textOf(node).replace(
          WAYS,
          (match, digits: string, word: string) => {
            const ways = digits
              ? Number.parseInt(digits, 10)
              : WORD_TO_NUMBER[word.toLowerCase()];
            if (ways === undefined) return match;
            const left = Math.max(0, ways - removed);
            return left === 1 ? "is 1 way" : `are ${left} ways`;
          },
        );
        return { ...node, children: [{ type: "text", value }] };
      }
      return { ...node, children: recount(node.children) };
    });

  return { ...tree, children: recount(children) as Root["children"] };
}
