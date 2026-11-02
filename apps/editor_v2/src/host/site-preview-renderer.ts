import { parseDocument } from "yaml";
import { parsePageMarkdown } from "../pages/markdown";
import type { ProsePageDocument } from "../templates/prose-page-content";

/** Display-only input for the local prose page template. */
export type SitePreviewDocument = ProsePageDocument;

export type SitePreviewContext = Pick<
  SitePreviewDocument,
  "breadcrumbs" | "formStatus" | "startSubPageVisible"
> & {
  publishedAt?: string | null;
};

/** Keep all YAML for display, and pass source Markdown rather than rendered HTML. */
export function sitePreviewDocument(
  source: string,
  context?: SitePreviewContext,
): SitePreviewDocument {
  const first = parsePageMarkdown(source).children[0];
  const yaml = first?.type === "yaml" ? first : undefined;

  const frontmatter: SitePreviewDocument["frontmatter"] =
    parseDocument(yaml?.value ?? "").toJS() ?? {};

  if (context?.publishedAt !== undefined) {
    if (context.publishedAt) frontmatter.publish_date = context.publishedAt;
    else delete frontmatter.publish_date;
  }

  const path = frontmatter.url ?? "/";

  if (
    // eslint-disable-next-line anti-slop/no-runtime-typeof -- This is the YAML-to-renderer path validation boundary.
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\?#]/.test(path)
  )
    throw new Error("Site preview needs a local page path without a query or fragment.");

  return {
    frontmatter,
    body: yaml ? source.slice(yaml.position!.end.offset) : source,
    path,
    breadcrumbs: context?.breadcrumbs ?? [{ label: "Home", href: "/" }],
    formStatus: context?.formStatus,
    startSubPageVisible: context?.startSubPageVisible,
  };
}
