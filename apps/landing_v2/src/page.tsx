import { RenderDocument } from "@govtech-bb/block-kit";
import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
import { Breadcrumbs } from "@govtech-bb/react";
import { useDocumentByUrl, useRenderData } from "@govtech-bb/spike-db/react";
import { Link, useLocation } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

const CATEGORY_TITLES = new Map(
  CATEGORY_TAXONOMY.map((category) => [category.slug, category.title]),
);

/** SPA navigation for each crumb, as the live site's breadcrumbs do it. */
const CrumbLink = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<"a"> & { href: string }
>(({ href, ...props }, ref) => <Link ref={ref} to={href} {...props} />);
CrumbLink.displayName = "CrumbLink";

const titleCase = (slug: string) => {
  const words = slug.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * The trail, derived from the url rather than stored on the document.
 *
 * The address already encodes the hierarchy — category, service, page — so a
 * breadcrumb field would be a second copy of the same fact, free to disagree
 * with the first. The category's title comes from the canonical taxonomy, so
 * a page filed under a category the estate does not have gets no crumb
 * rather than an invented one; a service has no such registry here, so its
 * slug is title-cased, exactly as `apps/landing` falls back today.
 *
 * The current page is deliberately absent: these are ancestors. That also
 * means `/bank-holiday-calendar`, which belongs to no category, gets Home
 * alone — which is the honest answer for an island-wide page.
 */
function crumbsFor(url: string) {
  const segments = url.split("/").filter(Boolean);
  const hasCategory = CATEGORY_TITLES.has(segments[0] ?? "");
  const category = hasCategory ? segments[0] : "";
  const rest = hasCategory ? segments.slice(1) : segments;
  const [service, ...path] = rest;

  const items = [{ href: "/", label: "Home" }];
  if (category) {
    items.push({ href: `/${category}`, label: CATEGORY_TITLES.get(category)! });
  }
  // The service page is an ancestor only when this page sits below it.
  if (service && path.length > 0) {
    items.push({
      href: `/${[category, service].filter(Boolean).join("/")}`,
      label: titleCase(service),
    });
  }
  return items;
}

/**
 * One component serves every content page: the URL is the key into
 * `content_pages`, exactly as it will be when this reads over HTTP.
 */
export function SitePage({ url }: { url: string }) {
  const doc = useDocumentByUrl(url);
  const { data, loading } = useRenderData(doc);

  if (doc === undefined) return <p className="site-loading">Loading…</p>;

  if (doc === null) {
    return (
      <div className="bk-document">
        <h1 className="bk-title">Page not found</h1>
        <p className="bk-paragraph">
          Nothing in <code>content_pages</code> has the url <code>{url}</code>.
        </p>
        <p className="bk-paragraph">
          <Link to="/">Back to the index</Link>
        </p>
      </div>
    );
  }

  // A finder page is one wide block; prose pages keep the reading measure.
  const wide = doc.body.blocks.some((block) => block.type === "finder");

  return (
    <div
      className={wide ? "bk-scope site-page site-wide" : "bk-scope site-page"}
    >
      <div className="site-crumbs">
        <Breadcrumbs
          items={crumbsFor(doc.url)}
          collapseOnMobile
          linkComponent={CrumbLink}
        />
      </div>
      <RenderDocument doc={doc} data={data} loading={loading} />
    </div>
  );
}

/** The splat route's component — resolves whatever path was requested. */
export function SitePageFromLocation() {
  const { pathname } = useLocation();
  return <SitePage url={pathname} />;
}
