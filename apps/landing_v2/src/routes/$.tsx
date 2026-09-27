import { RenderDocument } from "@govtech-bb/block-kit";
import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
import { Breadcrumbs } from "@govtech-bb/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { getPage } from "../server/pages";
import { startLinkHref } from "../start-link";

/**
 * Every content page, resolved by url.
 *
 * A splat route rather than one route per page, because the routing key is
 * `content_pages.url` — adding a page in the editor makes it reachable
 * without touching this file.
 *
 * The loader calls only `getPage`, a server function: in-process during SSR,
 * and through landing_v2's own server on a client-side navigation, so the
 * browser never calls api_v2. The document and every collection its blocks
 * read are in hand before the first byte of HTML. `RenderDocument` takes them
 * as props; it has no hooks, no fetching and no state in which it has been
 * mounted with nothing to show.
 */
export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const url = `/${params._splat ?? ""}`.replace(/\/+$/, "") || "/";
    const page = await getPage({ data: url });
    if (!page) throw notFound();
    return page;
  },
  // Assumption (#2702): 12 — the page's title and meta description, nothing
  // else: no canonical, Open Graph or JSON-LD.
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: loaderData.doc.title },
          ...(loaderData.doc.description
            ? [{ name: "description", content: loaderData.doc.description }]
            : []),
        ]
      : [],
  }),
  component: SitePage,
  notFoundComponent: NotFound,
});

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
 * The address already encodes the hierarchy, so a breadcrumb field would be a
 * second copy of the same fact, free to disagree with the first. Ancestors
 * only: the current page is not a crumb.
 *
 * Assumption (#2702): 13 — from the url and `CATEGORY_TAXONOMY`, as #2789 did
 * it; api_v2 has no categories table.
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
  if (service && path.length > 0) {
    items.push({
      href: `/${[category, service].filter(Boolean).join("/")}`,
      label: titleCase(service),
    });
  }
  return items;
}

function SitePage() {
  const { doc, data, formsUrl } = Route.useLoaderData();

  // A finder page is one wide block; prose pages keep the reading measure.
  const wide = doc.body.blocks.some((block) => block.type === "finder");

  return (
    <div className={wide ? "bk-scope site-page site-wide" : "bk-scope site-page"}>
      <div className="site-crumbs">
        <Breadcrumbs
          items={crumbsFor(doc.url)}
          collapseOnMobile
          linkComponent={CrumbLink}
        />
      </div>
      {/*
        `loading` is gone from the call entirely. It existed to tell an island
        "the records are not here yet", which was only ever true because the
        page rendered before its data arrived. Server-side it cannot happen.
      */}
      <RenderDocument
        doc={doc}
        data={data}
        resolveHref={startLinkHref(formsUrl)}
      />
    </div>
  );
}

function NotFound() {
  return (
    <div className="bk-document">
      <h1 className="bk-title">Page not found</h1>
      <p className="bk-paragraph">
        No published page in <code>content_pages</code> has that url.
      </p>
      <p className="bk-paragraph">
        <Link to="/">Back to the index</Link>
      </p>
    </div>
  );
}
