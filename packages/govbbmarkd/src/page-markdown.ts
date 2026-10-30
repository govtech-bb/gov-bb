import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import {
  defaultHandlers,
  toMarkdown,
  type Options,
} from "mdast-util-to-markdown";
import type { Directives, ContainerDirective } from "mdast-util-directive";
import type { Root, RootContent, PhrasingContent, Table } from "mdast";
import { z } from "zod";
import { isSafeContentUrl } from "@govtech-bb/govbbmarkd/content-url";

declare module "unified" {
  interface Data {
    toMarkdownExtensions?: Options[];
  }
}

const bodyProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .freeze();
const processor = bodyProcessor().use(remarkFrontmatter, ["yaml"]).freeze();

const contentUrl = z
  .string()
  .trim()
  .refine(isSafeContentUrl)
  .brand<"ContentUrl">();
const contentFormId = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
  .brand<"ContentFormId">();

/** A navigation destination; linked forms are resolved by the host, never by the label. */
export type PageActionTarget =
  | { readonly kind: "url"; readonly href: z.infer<typeof contentUrl> }
  | { readonly kind: "form"; readonly formId: z.infer<typeof contentFormId> }
  | { readonly kind: "linked-form" };

/** Parsed content components contain only supported attributes and meaningful children. */
export type PageMarkdownComponent =
  | {
      readonly kind: "action";
      readonly target: PageActionTarget;
      readonly variant: "primary" | "secondary";
      readonly label: PhrasingContent[];
    }
  | { readonly kind: "actions"; readonly body: RootContent[] }
  | { readonly kind: "notice"; readonly body: RootContent[] }
  | {
      readonly kind: "details";
      readonly summary: string;
      readonly body: RootContent[];
    }
  | {
      readonly kind: "table";
      readonly caption: string;
      readonly table: Table;
      readonly rowHeaders: "first" | "none";
      readonly numericColumns: readonly number[];
    }
  | {
      readonly kind: "summary-list";
      readonly body: RootContent[];
      readonly rows: readonly {
        readonly key: string;
        readonly value: RootContent[];
      }[];
    }
  | {
      readonly kind: "summary-item";
      readonly key: string;
      readonly body: RootContent[];
    };

/** Stable diagnostic categories for source editors and publishing adapters. */
export type PageMarkdownErrorCode =
  | "unsupported-component"
  | "invalid-attributes"
  | "invalid-content"
  | "unsafe-url"
  | "missing-fence"
  | "invalid-nesting";

/** An expected content failure; source locations are one-based and contain no source values. */
export class PageMarkdownError extends Error {
  /** Discriminator for callers translating a content error at their boundary. */
  readonly _tag = "PageMarkdownError";
  /** Stable category, independent of the human-readable message. */
  readonly code: PageMarkdownErrorCode;
  /** One-based source line, or 1 for a programmatically constructed node. */
  readonly line: number;
  /** One-based source column, or 1 for a programmatically constructed node. */
  readonly column: number;

  /** Builds a diagnostic without retaining the document or attribute values. */
  constructor(code: PageMarkdownErrorCode, message: string, node: RootContent) {
    super(`GovBB Markdown: ${message}`);
    this.code = code;
    this.line = node.position?.start.line ?? 1;
    this.column = node.position?.start.column ?? 1;
  }
}

/** Keeps content errors in the value channel until a framework adapter translates them. */
export type PageComponentResult =
  | { readonly ok: true; readonly value: PageMarkdownComponent }
  | { readonly ok: false; readonly error: PageMarkdownError };

/** Narrows the parser-owned directive nodes without approximating their attributes. */
export function isPageDirective(node: RootContent): node is Directives {
  return (
    node.type === "containerDirective" ||
    node.type === "leafDirective" ||
    node.type === "textDirective"
  );
}

function failure(
  node: RootContent,
  code: PageMarkdownErrorCode,
  message: string,
): PageComponentResult {
  return { ok: false, error: new PageMarkdownError(code, message, node) };
}

function labelParagraph(node: ContainerDirective) {
  return node.children.find(
    (child) =>
      child.type === "paragraph" && child.data?.directiveLabel === true,
  );
}

function componentBody(node: ContainerDirective): RootContent[] {
  return node.children.filter(
    (child) =>
      child.type !== "paragraph" || child.data?.directiveLabel !== true,
  );
}

function plainLabel(node: ContainerDirective): string | undefined {
  const label = labelParagraph(node);
  if (
    label?.type !== "paragraph" ||
    !label.children.every((child) => child.type === "text")
  )
    return undefined;
  return (
    label.children
      .map((child) => child.value)
      .join("")
      .trim() || undefined
  );
}

function actionLabel(nodes: PhrasingContent[]): boolean {
  return (
    nodes.every((node) => {
      if (
        node.type === "strong" ||
        node.type === "emphasis" ||
        node.type === "delete"
      )
        return actionLabel(node.children);
      return (
        node.type === "text" ||
        node.type === "inlineCode" ||
        node.type === "break"
      );
    }) &&
    nodes.some(
      (node) =>
        node.type !== "break" &&
        ("value" in node ? node.value.trim().length > 0 : true),
    )
  );
}

/** Parses an MDAST component at the editor/renderer boundary; unsupported forms are errors. */
export function parsePageComponent(node: Directives): PageComponentResult {
  const attributes = node.attributes ?? {};
  const allowed =
    node.name === "action"
      ? ["href", "form", "target", "variant"]
      : node.name === "details"
        ? ["summary"]
        : node.name === "table"
          ? ["row-headers", "numeric-columns"]
          : [];
  if (Object.keys(attributes).some((key) => !allowed.includes(key)))
    return failure(
      node,
      "invalid-attributes",
      `The ${node.name} component does not support these attributes.`,
    );

  if (
    node.name === "action" &&
    (node.type === "leafDirective" || node.type === "containerDirective")
  ) {
    let label: PhrasingContent[];
    if (node.type === "leafDirective") label = node.children;
    else {
      const paragraphs = node.children;
      const paragraph = paragraphs[0];
      if (
        paragraphs.length !== 1 ||
        paragraph?.type !== "paragraph" ||
        paragraph.data?.directiveLabel
      )
        return failure(
          node,
          "invalid-content",
          "An action needs one inline label, not blocks or other controls.",
        );
      label = paragraph.children;
    }
    if (!actionLabel(label))
      return failure(
        node,
        "invalid-content",
        "An action needs a non-empty label without links, images or HTML.",
      );
    const variant = attributes.variant ?? "primary";
    if (variant !== "primary" && variant !== "secondary")
      return failure(
        node,
        "invalid-attributes",
        "An action variant must be primary or secondary.",
      );
    if (
      ["href", "form", "target"].filter((key) => Object.hasOwn(attributes, key))
        .length !== 1
    )
      return failure(
        node,
        "invalid-attributes",
        'An action needs exactly one of href, form or target="form".',
      );
    let target: PageActionTarget;
    if (attributes.href !== undefined) {
      const parsed = contentUrl.safeParse(attributes.href);
      if (!parsed.success)
        return failure(node, "unsafe-url", "An action requires a safe href.");
      target = { kind: "url", href: parsed.data };
    } else if (attributes.form !== undefined) {
      const parsed = contentFormId.safeParse(attributes.form);
      if (!parsed.success)
        return failure(
          node,
          "invalid-attributes",
          "An action form must be a valid form identifier.",
        );
      target = { kind: "form", formId: parsed.data };
    } else {
      if (attributes.target !== "form")
        return failure(
          node,
          "invalid-attributes",
          "The only action target keyword is form.",
        );
      target = { kind: "linked-form" };
    }
    return { ok: true, value: { kind: "action", target, variant, label } };
  }

  if (node.type !== "containerDirective")
    return failure(
      node,
      "unsupported-component",
      `Unsupported component ${node.name}.`,
    );
  const body = componentBody(node);
  const label = plainLabel(node);
  switch (node.name) {
    case "notice":
      if (labelParagraph(node))
        return failure(
          node,
          "invalid-content",
          "A notice takes body content, not a label.",
        );
      return { ok: true, value: { kind: "notice", body } };
    case "details": {
      if (labelParagraph(node) && Object.hasOwn(attributes, "summary"))
        return failure(
          node,
          "invalid-attributes",
          "Details cannot have both a label and a summary attribute.",
        );
      const summary = label ?? attributes.summary?.trim();
      if (!summary)
        return failure(
          node,
          "invalid-content",
          "Details require a plain-text summary.",
        );
      return { ok: true, value: { kind: "details", summary, body } };
    }
    case "actions": {
      if (labelParagraph(node) || !body.length)
        return failure(
          node,
          "invalid-content",
          "An action group needs actions and has no label.",
        );
      let primary = 0;
      for (const child of body) {
        if (!isPageDirective(child) || child.name !== "action")
          return failure(
            node,
            "invalid-content",
            "Action groups can only contain action components.",
          );
        const action = parsePageComponent(child);
        if (!action.ok) return action;
        if (
          action.value.kind === "action" &&
          action.value.variant === "primary"
        )
          primary += 1;
      }
      if (primary > 1)
        return failure(
          node,
          "invalid-content",
          "An action group can contain at most one primary action.",
        );
      return { ok: true, value: { kind: "actions", body } };
    }
    case "table": {
      const table = body[0];
      if (!label || body.length !== 1 || table?.type !== "table")
        return failure(
          node,
          "invalid-content",
          "A table component requires a plain-text caption and exactly one Markdown table.",
        );
      const width = table.children[0]?.children.length ?? 0;
      if (!width || table.children.some((row) => row.children.length !== width))
        return failure(
          node,
          "invalid-content",
          "Every table row must have the same number of cells.",
        );
      const rowHeaders = attributes["row-headers"] ?? "none";
      if (rowHeaders !== "none" && rowHeaders !== "first")
        return failure(
          node,
          "invalid-attributes",
          "Table row-headers must be first or none.",
        );
      const numeric = attributes["numeric-columns"];
      const numericColumns =
        numeric == null
          ? []
          : numeric
              .split(",")
              .map((value) =>
                /^[1-9]\d*$/.test(value.trim()) ? Number(value) - 1 : -1,
              );
      if (
        numericColumns.some((index) => index < 0 || index >= width) ||
        new Set(numericColumns).size !== numericColumns.length
      )
        return failure(
          node,
          "invalid-attributes",
          "Table numeric-columns must name unique, existing columns, starting at 1.",
        );
      return {
        ok: true,
        value: {
          kind: "table",
          caption: label,
          table,
          rowHeaders,
          numericColumns,
        },
      };
    }
    case "summary-item":
      if (!label)
        return failure(
          node,
          "invalid-content",
          "A summary item requires a plain-text key.",
        );
      return { ok: true, value: { kind: "summary-item", key: label, body } };
    case "summary-list": {
      if (labelParagraph(node) || !body.length)
        return failure(
          node,
          "invalid-content",
          "A summary list requires summary items and has no label.",
        );
      const rows: { key: string; value: RootContent[] }[] = [];
      for (const child of body) {
        if (!isPageDirective(child) || child.name !== "summary-item")
          return failure(
            node,
            "invalid-content",
            "Summary lists can only contain summary items.",
          );
        const item = parsePageComponent(child);
        if (!item.ok) return item;
        if (item.value.kind === "summary-item")
          rows.push({ key: item.value.key, value: item.value.body });
      }
      return { ok: true, value: { kind: "summary-list", body, rows } };
    }
    default:
      return failure(
        node,
        "unsupported-component",
        `Unsupported component ${node.name}.`,
      );
  }
}

/** Disable frontmatter for bodies whose metadata is stored separately; full documents accept it by default. */
export interface MarkdownParseOptions {
  readonly frontmatter?: boolean;
}

/** Parses source without discarding legacy HTML; errors retain locations for source-only editing. */
export function parseContentMarkdown(
  source: string,
  options: MarkdownParseOptions = {},
): {
  readonly root: Root;
  readonly errors: readonly PageMarkdownError[];
} {
  const root = (
    options.frontmatter === false ? bodyProcessor : processor
  ).parse(source);
  const errors: PageMarkdownError[] = [];
  const visit = (node: Root | RootContent, ancestors: readonly string[]) => {
    if ("children" in node) {
      const parents =
        node.type !== "root" && isPageDirective(node)
          ? [...ancestors, node.name]
          : ancestors;
      node.children.forEach((child, index) => {
        if (
          child.type === "textDirective" &&
          source.slice(
            child.position?.start.offset,
            child.position?.end.offset,
          ) === `:${child.name}`
        ) {
          node.children[index] = {
            type: "text",
            value: `:${child.name}`,
            position: child.position,
          };
        } else if (
          child.type === "link" &&
          (parents.includes("action") ||
            (node.type === "paragraph" &&
              node.data?.directiveLabel === true)) &&
          (!child.position ||
            (child.children.every((part) => part.type === "text") &&
              source.slice(
                child.position.start.offset,
                child.position.end.offset,
              ) === child.children.map((part) => part.value).join("")))
        ) {
          // Automatic label links stay literal; authored link syntax remains invalid.
          node.children.splice(index, 1, ...child.children);
        } else visit(child, parents);
      });
    }
    if (node.type !== "root" && isPageDirective(node)) {
      const parsed = parsePageComponent(node);
      if (!parsed.ok) errors.push(parsed.error);
      if (node.name === "summary-item" && ancestors.at(-1) !== "summary-list")
        errors.push(
          new PageMarkdownError(
            "invalid-nesting",
            "Summary items belong inside a summary list.",
            node,
          ),
        );
      if (node.name === "details" && ancestors.includes("details"))
        errors.push(
          new PageMarkdownError(
            "invalid-nesting",
            "Details components cannot be nested.",
            node,
          ),
        );
      if (node.type === "containerDirective") {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start !== undefined && end !== undefined) {
          const lines = source.slice(start, end).split(/\r\n|\r|\n/);
          const opening = /^(:{3,})/.exec(lines[0] ?? "")?.[1];
          const closing = /^(?:[ \t]*>[ \t]?)*[ \t]*(:{3,})[ \t]*$/.exec(
            lines.at(-1) ?? "",
          )?.[1];
          const lastChildLine = node.children.at(-1)?.position?.end.line;
          if (
            !opening ||
            !closing ||
            closing.length < opening.length ||
            lines.length === 1 ||
            lastChildLine === node.position?.end.line
          )
            errors.push(
              new PageMarkdownError(
                "missing-fence",
                "Close the component with a matching colon fence.",
                node,
              ),
            );
        }
      }
    }
  };
  visit(root, []);
  const unique = new Map(
    errors.map((error) => [
      `${error.code}:${error.line}:${error.column}`,
      error,
    ]),
  );
  return {
    root,
    errors: [...unique.values()].sort(
      (left, right) => left.line - right.line || left.column - right.column,
    ),
  };
}

/** Serializes the parsed tree with standard escaping and nested directive fences. */
export function stringifyContentMarkdown(root: Root): string {
  return toMarkdown(root, {
    bullet: "-",
    emphasis: "_",
    fences: true,
    handlers: {
      text(node, parent, state, info) {
        // Directive labels omit the phrasing context that Markdown escaping needs.
        if (!state.stack.includes("containerDirectiveLabel"))
          return defaultHandlers.text(node, parent, state, info);
        const exit = state.enter("phrasing");
        const value = defaultHandlers.text(node, parent, state, info);
        exit();
        return value;
      },
    },
    extensions: processor.data("toMarkdownExtensions") ?? [],
  });
}
