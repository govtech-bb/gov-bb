import { Info, CaretCircleDown, CursorClick, ArrowSquareRight } from "@phosphor-icons/react";
import { $createLineBreakNode, $createParagraphNode, $createTextNode } from "lexical";
import { decodeHTMLAttribute, decodeHTMLStrict, encodeXML } from "entities";
import type { PhrasingContent } from "mdast";
import type { MarkdownNode, PageHandler, PageModule } from "../definition";
import { PageComponentNode, type PageComponentAttributes } from "../nodes";
import { blocks, phrasing, UnsupportedPageContent } from "../markdown";
import { pageInsertAction } from "../insertion";
import { safePageUrl } from "./text";

function startLabel(nodes: readonly MarkdownNode[]): PhrasingContent[] | undefined {
  const root: PhrasingContent[] = [];
  const stack = [{ tag: "", children: root }];

  for (const node of nodes) {
    const parent = stack.at(-1)!;

    if (node.type === "text" || node.type === "inlineCode" || node.type === "break")
      parent.children.push(node);
    else if (node.type === "strong" || node.type === "emphasis" || node.type === "delete") {
      const children = startLabel(node.children);

      if (!children) return;
      parent.children.push({ ...node, children });
    } else if (node.type === "html") {
      if (/^<br\s*\/?\s*>$/i.test(node.value)) {
        parent.children.push({ type: "break" });

        continue;
      }

      const match = /^<(\/?)(strong|em|del|code)>$/i.exec(node.value);

      if (!match) return;
      const tag = match[2]!.toLowerCase();

      if (!match[1]) stack.push({ tag, children: [] });
      else {
        if (stack.length === 1 || parent.tag !== tag) return;
        stack.pop();
        const children = stack.at(-1)!.children;

        if (tag === "code") {
          if (!parent.children.every((child) => child.type === "text")) return;
          children.push({
            type: "inlineCode",
            value: parent.children.map((child) => child.value).join(""),
          });
        } else
          children.push({
            type: tag === "strong" ? "strong" : tag === "em" ? "emphasis" : "delete",
            children: parent.children,
          });
      }
    } else return;
  }

  return stack.length === 1 ? root : undefined;
}

function startText(value: string) {
  // These characters must remain literal even when the anchor is parsed as inline Markdown.
  return encodeXML(value).replace(
    /[\\`*_[\]~:\r\n]/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
}

function startLabelHtml(node: MarkdownNode): string {
  if (node.type === "text") return startText(node.value);

  if (node.type === "inlineCode") return `<code>${startText(node.value)}</code>`;

  if (node.type === "break" || (node.type === "html" && /^<br\s*\/?\s*>$/i.test(node.value)))
    return "<br>";

  if (node.type === "strong" || node.type === "emphasis" || node.type === "delete") {
    const tag = node.type === "strong" ? "strong" : node.type === "emphasis" ? "em" : "del";

    return `<${tag}>${node.children.map(startLabelHtml).join("")}</${tag}>`;
  }

  throw new Error("This Start button label contains content that cannot be saved as inline text");
}

function startLink(node: MarkdownNode): { label: PhrasingContent[]; href?: string } | undefined {
  let value: string;
  let content: readonly MarkdownNode[] | undefined;

  if (node.type === "paragraph") {
    const first = node.children[0];
    const last = node.children.at(-1);

    if (first?.type !== "html" || last?.type !== "html" || last.value !== "</a>") return;

    value = `${first.value}</a>`;
    content = node.children.slice(1, -1);
  } else if (node.type === "html") value = node.value;
  else return;

  const match =
    /^<a\s+data-start-link(?:\s+href=(?:"([^"<>]*)"|'([^'<>]*)'))?\s*>([\s\S]*)<\/a>$/i.exec(value);

  if (!match) return;

  const href =
    match[1] !== undefined || match[2] !== undefined
      ? decodeHTMLAttribute(match[1] ?? match[2]!)
      : undefined;

  if (href !== undefined && !safePageUrl(href)) return;

  if (!content) {
    content = match[3]!
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

function attributes(node: MarkdownNode): PageComponentAttributes {
  if (node.type !== "containerDirective" && node.type !== "leafDirective")
    throw new UnsupportedPageContent(node);
  const data = node.attributes ?? {};

  const allowed =
    node.name === "details" ? ["summary"] : node.name === "action" ? ["href", "variant"] : [];

  if (Object.keys(data).some((key) => !allowed.includes(key)))
    throw new UnsupportedPageContent(
      node,
      "This component has attributes that need source editing",
    );

  if (node.name === "details" && !data.summary)
    throw new UnsupportedPageContent(node, "Details need a summary");

  if (
    node.name === "action" &&
    (!data.href ||
      !safePageUrl(data.href) ||
      (data.variant != null && !["primary", "secondary"].includes(data.variant)))
  )
    throw new UnsupportedPageContent(node, "The action destination or style needs source editing");

  return {
    ...(data.summary != null && { summary: data.summary }),
    ...(data.href != null && { href: data.href }),
    ...(data.variant != null && { variant: data.variant }),
  };
}

const components: PageHandler = {
  accepts: (node) =>
    node.type === "html" ||
    !!startLink(node) ||
    node.type === "containerDirective" ||
    node.type === "leafDirective" ||
    node.type === "textDirective",
  owns: (node) => node instanceof PageComponentNode,
  $import(node, context) {
    const start = startLink(node);

    if (start)
      return [
        new PageComponentNode("start", start.href === undefined ? {} : { href: start.href }).append(
          ...start.label.flatMap((child) => context.$import(child)),
        ),
      ];

    if (node.type === "html" && /^<br\s*\/?\s*>$/i.test(node.value))
      return [$createLineBreakNode()];

    if (
      node.type === "containerDirective" &&
      ["notice", "details", "actions"].includes(node.name)
    ) {
      const attrs = attributes(node);

      if (
        node.name === "actions" &&
        (!node.children.length ||
          node.children.some((child) => child.type !== "leafDirective" || child.name !== "action"))
      )
        throw new UnsupportedPageContent(node, "Action groups must contain actions");
      // SAFETY: The component name is checked against the three container variants immediately above.
      const result = new PageComponentNode(node.name as "notice" | "details" | "actions", attrs);
      result.append(...node.children.flatMap((child) => context.$import(child)));

      if (!result.getChildrenSize()) result.append($createParagraphNode());

      return [result];
    }

    if (node.type === "leafDirective" && node.name === "action")
      return [
        new PageComponentNode("action", attributes(node)).append(
          ...node.children.flatMap((child) => context.$import(child)),
        ),
      ];
    throw new UnsupportedPageContent(node, "This HTML or component needs Markdown source editing");
  },
  $export(node, context) {
    if (!(node instanceof PageComponentNode)) throw new Error("Expected a page component");
    const kind = node.getKind();
    const data = node.getAttributes();

    if (kind === "start")
      return [
        {
          type: "html",
          value: `<a data-start-link${data.href === undefined ? "" : ` href="${encodeXML(data.href)}"`}>${node
            .getChildren()
            .flatMap((child) => context.$export(child))
            .map(startLabelHtml)
            .join("")}</a>`,
        },
      ];
    const children = node.getChildren().flatMap((child) => context.$export(child));

    if (kind === "action")
      return [
        {
          type: "leafDirective",
          name: "action",
          attributes: { href: data.href ?? "", ...(data.variant && { variant: data.variant }) },
          children: phrasing(children),
        },
      ];

    return [
      {
        type: "containerDirective",
        name: kind,
        attributes: kind === "details" ? { summary: data.summary ?? "More information" } : {},
        children: blocks(children),
      },
    ];
  },
  render(node, context, key) {
    const start = startLink(node);

    if (start)
      return (
        <p key={key}>
          <a
            className="page-action"
            href={start.href}
            data-start-link=""
            aria-disabled={start.href === undefined ? "true" : undefined}
          >
            {start.label.map((child, index) => context.render(child, `${key}/${index}`))}
          </a>
        </p>
      );

    if (node.type === "html" && /^<br\s*\/?\s*>$/i.test(node.value)) return <br key={key} />;

    if (node.type === "containerDirective" || node.type === "leafDirective") {
      const data = attributes(node);

      const children = node.children.map((child, index) =>
        context.render(child, `${key}/${index}`),
      );

      if (node.name === "notice")
        return (
          <aside key={key} className="page-notice">
            {children}
          </aside>
        );

      if (node.name === "details")
        return (
          <details key={key} className="page-details">
            <summary>{data.summary}</summary>
            {children}
          </details>
        );

      if (node.name === "actions")
        return (
          <div key={key} className="page-actions">
            {children}
          </div>
        );

      if (node.name === "action")
        return (
          <a
            key={key}
            className={`page-action ${data.variant === "secondary" ? "page-action-secondary" : ""}`}
            href={data.href}
          >
            {children}
          </a>
        );
    }

    throw new UnsupportedPageContent(node);
  },
};

export function PageComponentsModule(): PageModule {
  return {
    key: "page-components",
    requires: ["text"],
    nodes: [{ type: "page-component", node: PageComponentNode }],
    markdown: [components],
    actions: [
      pageInsertAction(
        "page-notice",
        "Notice",
        () => new PageComponentNode("notice").append($createParagraphNode()),
        {
          group: "Components",
          order: 40,
          icon: <Info />,
          description: "Highlight information readers need to know.",
        },
      ),
      pageInsertAction(
        "page-details",
        "Details",
        () =>
          new PageComponentNode("details", { summary: "More information" }).append(
            $createParagraphNode(),
          ),
        {
          group: "Components",
          order: 40,
          icon: <CaretCircleDown />,
          description: "Let readers expand supporting information.",
        },
      ),
      pageInsertAction(
        "page-actions",
        "Action buttons",
        () =>
          new PageComponentNode("actions").append(
            new PageComponentNode("action", { href: "#" }).append($createTextNode("Continue")),
          ),
        {
          group: "Components",
          order: 40,
          icon: <CursorClick />,
          description: "Link to the next step or related pages.",
        },
      ),
      pageInsertAction(
        "page-start",
        "Start button",
        () => new PageComponentNode("start").append($createTextNode("Start now")),
        {
          group: "Components",
          order: 40,
          icon: <ArrowSquareRight />,
          description: "Take readers to the linked form.",
        },
      ),
    ],
  };
}
