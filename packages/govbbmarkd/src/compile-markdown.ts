import type { Root as HtmlRoot, RootContent } from "hast";
import type { Root as MarkdownRoot } from "mdast";
import type { Handlers } from "mdast-util-to-hast";
import { unified } from "unified";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import {
  parseContentMarkdown,
  type PageMarkdownError,
  type MarkdownParseOptions,
} from "#govbbmarkd/page-markdown";
import {
  readMarkdownDocument,
  type MarkdownDocument,
} from "#govbbmarkd/markdown-document";
import componentDirectives from "#govbbmarkd/plugins/component-directives";
import contentUrls from "#govbbmarkd/plugins/content-urls";
import tableScopes from "#govbbmarkd/plugins/table-scopes";

/** @deprecated Raw HTML passthrough is only for existing trusted pages; omit this option for escaped HTML. */
export interface LegacyMarkdownHtml {
  /** @deprecated Preserves legacy HTML, including attributes; this is not sanitization. */
  readonly html: "legacy";
}

/** Raw HTML is escaped unless a host explicitly opts into its legacy trusted-content policy. */
export type MarkdownCompileOptions = MarkdownParseOptions &
  ({ readonly html?: "escape" } | LegacyMarkdownHtml);

/** A validated document's renderable HTML tree and readable structure. */
export interface CompiledContentMarkdown extends MarkdownDocument {
  readonly hast: HtmlRoot;
}

/** Invalid authoring is a located diagnostic, not a thrown exception. */
export type MarkdownCompileResult =
  | { readonly ok: true; readonly value: CompiledContentMarkdown }
  | { readonly ok: false; readonly errors: readonly PageMarkdownError[] };

function escapeHtml() {
  return (tree: HtmlRoot) => {
    function visit(node: HtmlRoot | RootContent): void {
      if (!("children" in node)) return;
      node.children = node.children.map((child) =>
        child.type === "raw"
          ? { type: "text", value: child.value, position: child.position }
          : child,
      );
      for (const child of node.children) visit(child);
    }
    visit(tree);
  };
}

function markdownCompiler(html: "escape" | "legacy", handlers?: Handlers) {
  return unified()
    .use(componentDirectives, handlers)
    .use(remarkRehype, { allowDangerousHtml: true, handlers })
    .use(html === "legacy" ? rehypeRaw : escapeHtml)
    .use(contentUrls)
    .use(tableScopes)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      content: { type: "text", value: "#" },
      properties: {
        ariaHidden: "true",
        className: ["anchor-heading"],
        tabIndex: -1,
      },
    })
    .freeze();
}

const escapedCompiler = markdownCompiler("escape");
const legacyCompiler = markdownCompiler("legacy");

/** @internal Compiles an already parsed tree; legacy React adapters may retain node renderers. */
export function compileMarkdownTree(
  root: MarkdownRoot,
  html: "escape" | "legacy",
  handlers?: Handlers,
): HtmlRoot {
  const compiler = handlers
    ? markdownCompiler(html, handlers)
    : html === "legacy"
      ? legacyCompiler
      : escapedCompiler;
  return compiler.runSync(root);
}

/** Compiles validated Markdown without loading React, resolving references, or changing source bytes. */
export function compileContentMarkdown(
  source: string,
  options: MarkdownCompileOptions = {},
): MarkdownCompileResult {
  const parsed = parseContentMarkdown(source, options);
  if (parsed.errors.length) return { ok: false, errors: parsed.errors };
  const hast = compileMarkdownTree(parsed.root, options.html ?? "escape");
  return { ok: true, value: { hast, ...readMarkdownDocument(hast) } };
}

/**
 * Reads text and headings, including legacy HTML text, without executing or returning HTML.
 * Incomplete drafts retain their diagnostics; this analysis does not authorize publication.
 */
export function analyzeContentMarkdown(
  source: string,
  options: MarkdownParseOptions = {},
): MarkdownDocument & { readonly errors: readonly PageMarkdownError[] } {
  const parsed = parseContentMarkdown(source, options);
  const hast = compileMarkdownTree(parsed.root, "legacy");
  return { ...readMarkdownDocument(hast), errors: parsed.errors };
}
