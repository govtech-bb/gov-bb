import { isPageDirective, parsePageComponent } from "#govbbmarkd/page-markdown";
import { toHast, type Handlers } from "mdast-util-to-hast";
import type { Root, RootContent } from "mdast";
import type { Plugin } from "unified";

/** Annotates valid components; callers retain diagnostics and decide whether the tree may be rendered. */
const componentDirectives: Plugin<[handlers?: Handlers | undefined], Root> =
  (handlers) => (tree) => {
    function visit(node: Root | RootContent): void {
      if (node.type !== "root" && isPageDirective(node)) {
        const parsed = parsePageComponent(node);
        // Text analysis also accepts incomplete drafts, leaving invalid components uninterpreted.
        if (!parsed.ok) return;
        const component = parsed.value;
        node.data ??= {};
        switch (component.kind) {
          case "action": {
            const inline = toHast(
              {
                type: "paragraph",
                children: component.label,
              },
              { handlers },
            );
            if (!inline || inline.type !== "element")
              throw new Error("Expected an inline action label");
            node.data.hChildren = inline.children;
            if (component.target.kind === "url") {
              node.data.hName = "link-button";
              node.data.hProperties = { href: component.target.href };
            } else {
              node.data.hName = "a";
              node.data.hProperties = { dataStartLink: "" };
              if (component.target.kind === "form")
                node.data.hProperties.dataFormId = component.target.formId;
            }
            if (component.variant === "secondary")
              node.data.hProperties.variant = "secondary";
            return;
          }
          case "actions":
            node.data.hName = "buttons";
            break;
          case "notice":
            node.data.hName = "notice";
            break;
          case "details":
            node.data.hName = "show-hide";
            node.data.hProperties = { summary: component.summary };
            break;
          case "summary-list":
            node.data.hName = "summary-list";
            break;
          case "summary-item":
            node.data.hName = "summary-item";
            node.data.hProperties = { dataSummaryKey: component.key };
            break;
          case "table":
            node.data.hName = "div";
            component.table.data = {
              hProperties: {
                dataCaption: component.caption,
                dataRowHeaders: component.rowHeaders,
                dataNumericColumns: component.numericColumns.join(","),
              },
            };
            break;
        }
        if (node.type === "containerDirective")
          node.children = node.children.filter(
            (child) =>
              child.type !== "paragraph" || child.data?.directiveLabel !== true,
          );
      }
      if ("children" in node) for (const child of node.children) visit(child);
    }
    visit(tree);
  };

export default componentDirectives;
