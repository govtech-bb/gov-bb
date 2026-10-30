import {
  ButtonGroup,
  SummaryList,
  LinkButton,
  Link,
  ShowHide,
  Table,
  TableCell,
  TableHeader,
} from "@govtech-bb/react";
import { createElement, Fragment } from "react";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { Components, ExtraProps } from "hast-util-to-jsx-runtime";
import type { RootContent } from "hast";
import type { RootContent as MarkdownNode } from "mdast";
import type { MarkdownCompileOptions } from "#govbbmarkd/compile-markdown";
import {
  compileLegacyMarkdownPreview,
  type LegacyMarkdownRenderer,
} from "#govbbmarkd/legacy-preview";
import { LegacyMarkdownNotice } from "#govbbmarkd/legacy-notice";

export { LegacyMarkdownNotice } from "#govbbmarkd/legacy-notice";
export type { LegacyMarkdownRenderer } from "#govbbmarkd/legacy-preview";
/** Host overrides supply routing, reference resolution and retained application HTML components. */
export type MarkdownComponents = Partial<Components> &
  Partial<Record<string, ElementType>>;

const PHONE_SLASH_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})\s*\/\s*(\d{4})$/;
const PHONE_RE = /^\((\d{3})\)\s*(\d{3})-(\d{4})$/;
const STACKED_CELL =
  "max-md:block max-md:w-full max-md:before:block max-md:before:font-bold max-md:before:content-[attr(data-label)]";

/** @deprecated Bare tables retain phone-number recognition; author explicit tel: links in captioned tables. */
function extractCellText(children: ReactNode): string | null {
  if (typeof children === "string") return children;
  if (
    Array.isArray(children) &&
    children.length === 1 &&
    typeof children[0] === "string"
  ) {
    return children[0];
  }
  return null;
}

/** Renders a compiled document with GovBB components; unresolved form actions remain inert unless the host resolves them. */
export function renderMarkdownNodes(
  children: RootContent[],
  overrides: MarkdownComponents = {},
): ReactNode {
  return renderCompiledMarkdownNodes(children, overrides);
}

/** @deprecated Retains old editor MDAST callbacks; new hosts use compileContentMarkdown and renderMarkdownNodes component overrides. Nodes must already pass host validation. */
export function renderLegacyMarkdownNodes(
  children: MarkdownNode[],
  resolveRenderer: LegacyMarkdownRenderer,
  options: MarkdownCompileOptions = {},
): ReactNode {
  const { hast, renderers } = compileLegacyMarkdownPreview(
    children,
    resolveRenderer,
    options,
  );
  return renderCompiledMarkdownNodes(hast.children, {}, renderers);
}

function renderCompiledMarkdownNodes(
  children: RootContent[],
  overrides: MarkdownComponents,
  legacyRenderers?: ReadonlyMap<string, () => ReactNode>,
): ReactNode {
  const render = (
    nodes: RootContent[],
    components = markdownComponents,
  ): ReactNode => {
    const scoped = legacyRenderers?.size ? { ...components } : components;
    if (legacyRenderers?.size) {
      const tags = new Set<string>();
      function visit(node: RootContent): void {
        if (node.type !== "element") return;
        if (typeof node.properties.dataGovbbmarkdRenderer === "string")
          tags.add(node.tagName);
        node.children.forEach(visit);
      }
      nodes.forEach(visit);
      for (const tag of tags) {
        const Component = components[tag] ?? tag;
        scoped[tag] = ({ node, ...props }: ExtraProps) => {
          const key = node?.properties.dataGovbbmarkdRenderer;
          const renderer =
            typeof key === "string" ? legacyRenderers.get(key) : undefined;
          if (renderer) return renderer();
          return createElement(
            Component,
            typeof Component === "string" ? props : { ...props, node },
          );
        };
      }
    }
    return toJsxRuntime(
      { type: "root", children: nodes },
      {
        Fragment,
        jsx,
        jsxs,
        components: scoped,
        ignoreInvalidStyle: true,
        passKeys: true,
        passNode: true,
      },
    );
  };

  const markdownComponents: MarkdownComponents = {
    a: ({ node, href, children, ...rest }) =>
      node?.properties.dataStartLink !== undefined ? (
        <LinkButton
          {...rest}
          href={href}
          aria-disabled={!href || undefined}
          variant={
            node.properties.variant === "secondary" ? "secondary" : "primary"
          }
        >
          {children}
        </LinkButton>
      ) : (
        <Link href={href} {...rest}>
          {children}
        </Link>
      ),
    // Uncaptioned tables retain their stacked layout rather than an unnamed scroll region.
    //
    // Below the tablet breakpoint each row stacks into a block: its row header
    // is the title and every other cell shows its column as a label (the
    // `data-label` tableScopes adds), because the design system's fixed, equal
    // columns break words anywhere at phone width. `display: block` drops the
    // implicit table semantics in some screen readers, so the roles are explicit.
    table: ({ node, ...props }) => {
      if (node && typeof node.properties.dataCaption === "string") {
        return (
          <Table caption={node.properties.dataCaption} scrollable>
            {render(node.children, {
              ...markdownComponents,
              thead: "thead",
              tbody: "tbody",
              tr: "tr",
              th: ({ node: cell, ...cellProps }) => (
                <TableHeader
                  {...cellProps}
                  numeric={cell?.properties.dataNumeric === true}
                />
              ),
              td: ({ node: cell, ...cellProps }) => (
                <TableCell
                  {...cellProps}
                  numeric={cell?.properties.dataNumeric === true}
                />
              ),
              ...overrides,
            })}
          </Table>
        );
      }
      return (
        <div className="my-s overflow-x-auto">
          <Table {...props} role="table" className="max-md:block" />
        </div>
      );
    },
    thead: ({ node: _node, ...props }) => (
      <thead {...props} role="rowgroup" className="max-md:sr-only" />
    ),
    tbody: ({ node: _node, ...props }) => (
      <tbody {...props} role="rowgroup" className="max-md:block" />
    ),
    tr: ({ node: _node, ...props }) => (
      <tr {...props} role="row" className="max-md:mb-s max-md:block" />
    ),
    th: ({ node: _node, ...props }) => (
      <TableHeader
        {...props}
        role={props.scope === "row" ? "rowheader" : "columnheader"}
        className="max-md:block max-md:w-full"
      />
    ),
    td: ({ node: _node, children, ...rest }) => {
      const text = extractCellText(children);
      const props = { ...rest, role: "cell", className: STACKED_CELL };

      const slashMatch = text?.match(PHONE_SLASH_RE);
      if (slashMatch) {
        const [, area, prefix, line, line2] = slashMatch;
        return (
          <TableCell {...props}>
            <a
              className="whitespace-nowrap text-teal-80 underline"
              href={`tel:+1${area}${prefix}${line}`}
            >
              {`(${area}) ${prefix}-${line}`}
            </a>
            {" / "}
            <a
              className="whitespace-nowrap text-teal-80 underline"
              href={`tel:+1${area}${prefix}${line2}`}
            >
              {line2}
            </a>
          </TableCell>
        );
      }

      const phoneMatch = text?.match(PHONE_RE);
      if (phoneMatch) {
        const [, area, prefix, line] = phoneMatch;
        return (
          <TableCell {...props}>
            <a
              className="whitespace-nowrap text-teal-80 underline"
              href={`tel:+1${area}${prefix}${line}`}
            >
              {text}
            </a>
          </TableCell>
        );
      }

      return <TableCell {...props}>{children}</TableCell>;
    },
    notice: LegacyMarkdownNotice,
    "show-hide": ({
      node: _node,
      summary,
      children,
      ...props
    }: {
      node?: unknown;
      summary?: string;
      children?: ReactNode;
    }) => (
      <ShowHide summary={summary || "More information"} {...props}>
        {children}
      </ShowHide>
    ),
    buttons: ({ children }: { children?: ReactNode }) => (
      <ButtonGroup>{children}</ButtonGroup>
    ),
    "summary-list": ({ node, ...props }: ExtraProps) => {
      if (!node) throw new Error("Expected a compiled summary list");
      const items = node.children.filter(
        (child) => child.type !== "text" || child.value.trim(),
      );
      const rows = items.map((child) => {
        if (child.type !== "element" || child.tagName !== "summary-item")
          return undefined;
        const key = child.properties.dataSummaryKey;
        if (typeof key !== "string") return undefined;
        return { key, value: render(child.children) };
      });
      // Raw legacy HTML may use these tag names without directive metadata.
      if (!rows.every((row) => row !== undefined))
        return createElement("summary-list", props);

      const customRows =
        overrides["summary-item"] !== undefined ||
        items.some((child) => {
          if (child.type !== "element") return false;
          const key = child.properties.dataGovbbmarkdRenderer;
          return typeof key === "string" && legacyRenderers?.has(key);
        });
      if (customRows) {
        // SummaryList has no row-render slot; overrides still replace whole rows.
        return (
          <dl className="govbb-summary-list">
            {render(items, {
              ...markdownComponents,
              "summary-item": ({
                node: item,
                children,
              }: ExtraProps & { children?: ReactNode }) => (
                <div className="govbb-summary-list__row">
                  <dt className="govbb-summary-list__key">
                    {String(item?.properties.dataSummaryKey)}
                  </dt>
                  <dd className="govbb-summary-list__value">{children}</dd>
                </div>
              ),
              ...overrides,
            })}
          </dl>
        );
      }
      return <SummaryList rows={rows} />;
    },
    "summary-item": ({ node: _node, ...props }: ExtraProps) =>
      createElement("summary-item", props),
    "link-button": ({
      node: _node,
      ...props
    }: ComponentProps<typeof LinkButton> & ExtraProps) => (
      <LinkButton {...props} />
    ),
    ...overrides,
  };
  return render(children);
}
