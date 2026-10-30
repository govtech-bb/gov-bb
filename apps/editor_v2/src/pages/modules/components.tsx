import {
  Info,
  CaretCircleDown,
  CursorClick,
  ArrowSquareRight,
  ListDashes,
} from "@phosphor-icons/react";
import {
  isPageDirective,
  parsePageComponent,
  type PageMarkdownComponent,
} from "@govtech-bb/govbbmarkd";
import { $createLineBreakNode, $createParagraphNode, $createTextNode } from "lexical";
import {
  parseLegacyPageStartLink,
  serializeLegacyPageStartLink,
} from "@govtech-bb/govbbmarkd/legacy";
import type { MarkdownNode, PageHandler, PageModule } from "../definition";
import { PageComponentNode, type PageComponentAttributes } from "../nodes";
import { defineSlot } from "../../editor/react/contributions";
import { blocks, phrasing, UnsupportedPageContent } from "../markdown";
import { pageInsertAction } from "../insertion";
import { PageButtonLink } from "../button-link";
import { safePageUrl } from "./text";

function assertPageComponent(node: MarkdownNode): PageMarkdownComponent {
  if (!isPageDirective(node)) throw new UnsupportedPageContent(node);
  const parsed = parsePageComponent(node);

  // Lexical's synchronous import boundary translates this into a source-only draft.
  if (!parsed.ok) throw new UnsupportedPageContent(node, parsed.error.message);

  return parsed.value;
}

function componentAttributes(component: PageMarkdownComponent): PageComponentAttributes {
  switch (component.kind) {
    case "action": {
      const attributes: PageComponentAttributes = {};

      if (component.variant === "secondary") attributes.variant = "secondary";

      if (component.target.kind === "url") attributes.href = component.target.href;
      else if (component.target.kind === "form") attributes.form = component.target.formId;
      else attributes.target = "form";

      return attributes;
    }

    case "details":
      return { summary: component.summary };
    case "summary-item":
      return { summaryKey: component.key };
    case "table":
      return {
        caption: component.caption,
        rowHeaders: component.rowHeaders,
        numericColumns: component.numericColumns,
      };
    default:
      return {};
  }
}

const components: PageHandler = {
  accepts: (node) =>
    node.type === "html" ||
    !!parseLegacyPageStartLink(node) ||
    node.type === "containerDirective" ||
    node.type === "leafDirective" ||
    node.type === "textDirective",
  owns: (node) => node instanceof PageComponentNode,
  $import(node, context) {
    const start = parseLegacyPageStartLink(node);

    if (start?.href !== undefined && !safePageUrl(start.href))
      throw new UnsupportedPageContent(node, "This link destination needs source editing");

    if (start)
      return [
        new PageComponentNode("start", start.href === undefined ? {} : { href: start.href }).append(
          ...start.label.flatMap((child) => context.$import(child)),
        ),
      ];

    if (node.type === "html" && /^<br\s*\/?\s*>$/i.test(node.value))
      return [$createLineBreakNode()];

    const component = assertPageComponent(node);
    const result = new PageComponentNode(component.kind, componentAttributes(component));

    const children =
      component.kind === "action"
        ? component.label
        : component.kind === "table"
          ? [component.table]
          : component.body;

    result.append(...children.flatMap((child) => context.$import(child)));

    if (!result.getChildrenSize()) result.append($createParagraphNode());

    return [result];
  },
  $export(node, context) {
    if (!(node instanceof PageComponentNode)) throw new Error("Expected a page component");
    const kind = node.getKind();
    const data = node.getAttributes();

    if (kind === "start")
      return [
        {
          type: "html",
          value: serializeLegacyPageStartLink(
            node.getChildren().flatMap((child) => context.$export(child)),
            data.href,
          ),
        },
      ];
    const children = node.getChildren().flatMap((child) => context.$export(child));

    if (kind === "action")
      return [
        {
          type: "containerDirective",
          name: "action",
          attributes: {
            href: data.href,
            form: data.form,
            target: data.target,
            variant: data.variant,
          },
          children: [{ type: "paragraph", children: phrasing(children) }],
        },
      ];

    const label =
      kind === "details"
        ? data.summary
        : kind === "table"
          ? data.caption
          : kind === "summary-item"
            ? data.summaryKey
            : undefined;

    const body = blocks(children);

    if (label !== undefined)
      body.unshift({
        type: "paragraph",
        data: { directiveLabel: true },
        children: [{ type: "text", value: label }],
      });

    return [
      {
        type: "containerDirective",
        name: kind,
        attributes:
          kind === "table"
            ? {
                "row-headers": data.rowHeaders === "first" ? "first" : undefined,
                "numeric-columns": data.numericColumns?.length
                  ? data.numericColumns.map((index) => index + 1).join(",")
                  : undefined,
              }
            : {},
        children: body,
      },
    ];
  },
};

/** Registers authored components while preserving existing HTML start markers. */
export function PageComponentsModule(): PageModule {
  return {
    key: "page-components",
    requires: ["text"],
    nodes: [{ type: "page-component", node: PageComponentNode }],
    markdown: [components],
    slots: [defineSlot("page-button-link", "editor.overlay", () => <PageButtonLink />)],
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
          aliases: ["callout", "inset text", "important", "note"],
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
          aliases: ["disclosure", "expand", "show and hide", "more information"],
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
          aliases: ["button", "link button"],
        },
      ),
      pageInsertAction(
        "page-start",
        "Start button",
        () =>
          new PageComponentNode("action", { target: "form" }).append($createTextNode("Start now")),
        {
          group: "Components",
          order: 40,
          icon: <ArrowSquareRight />,
          description: "Take readers to the linked form.",
          aliases: ["start now", "apply", "call to action"],
        },
      ),
      pageInsertAction(
        "page-summary-list",
        "Summary list",
        () =>
          new PageComponentNode("summary-list").append(
            new PageComponentNode("summary-item", { summaryKey: "Key" }).append(
              $createParagraphNode(),
            ),
          ),
        {
          group: "Components",
          order: 40,
          icon: <ListDashes />,
          description: "Present named facts and their values.",
          aliases: ["key value", "facts"],
        },
      ),
    ],
  };
}
