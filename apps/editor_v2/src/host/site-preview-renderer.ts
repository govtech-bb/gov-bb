import { parseDocument } from "yaml";
import { parsePageMarkdown } from "../pages/markdown";

/** Display-only runtime contract with landing's /cms-preview/renderer.js. No source imports cross apps. */
export type SitePreviewDocument = {
  // eslint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Opaque YAML crosses the renderer boundary; landing validates the fields it reads.
  frontmatter: Record<string, unknown>;
  body: string;
  path: string;
  breadcrumbs: Array<{ label: string; href: string }>;
  formStatus?: "available" | "unavailable" | "maintenance" | "closed";
  startSubPageVisible?: boolean;
};

export type SitePreviewRegions = { title: HTMLElement; lede: HTMLElement; body: HTMLElement };

export type SitePreviewHandle = {
  update: (document: SitePreviewDocument) => Promise<void>;
  setEditing: (editing: boolean) => SitePreviewRegions | null;
  dispose: () => void;
};

export type SitePreviewRenderer = {
  mountCmsPreview: (
    container: HTMLElement,
    document: SitePreviewDocument,
    assetBase: string,
  ) => Promise<SitePreviewHandle>;
};

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

/** Never take executable module or stylesheet URLs from authored content. */
export function sitePreviewBase(configured = import.meta.env.VITE_SITE_PREVIEW_URL): URL {
  if (!configured)
    throw new Error(
      "Site preview is not configured. Set VITE_SITE_PREVIEW_URL to the landing renderer’s asset directory.",
    );
  const url = new URL(configured);

  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Site preview requires a trusted HTTPS asset directory.");

  if (!url.pathname.endsWith("/")) url.pathname += "/";

  return url;
}
