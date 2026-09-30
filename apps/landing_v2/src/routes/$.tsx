import { Breadcrumbs, LinkButton } from "@govtech-bb/react";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
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
 * browser never calls api_v2. api_v2 has already decided everything about
 * visibility — a hidden page is a 404, a bare slug a redirect, and a Start
 * link that leads nowhere public is gone from the hast — so this renders
 * whatever comes back.
 */
export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const url = `/${params._splat ?? ""}`.replace(/\/+$/, "") || "/";
    const loaded = await getPage({ data: url });
    if (!loaded) throw notFound();
    if (loaded.kind === "redirect") {
      throw redirect({ href: loaded.url, statusCode: 301 });
    }
    return { page: loaded.page, formsUrl: loaded.formsUrl };
  },
  // Assumption (#2702): 12 — the page's title and meta description, nothing
  // else: no canonical, Open Graph or JSON-LD.
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: loaderData.page.frontmatter.title },
          ...(loaderData.page.frontmatter.description
            ? [
                {
                  name: "description",
                  content: loaderData.page.frontmatter.description,
                },
              ]
            : []),
        ]
      : [],
  }),
  component: SitePage,
  notFoundComponent: NotFound,
});

/** SPA navigation for each crumb, as the live site's breadcrumbs do it. */
const CrumbLink = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<"a"> & { href: string }
>(({ href, ...props }, ref) => <Link ref={ref} to={href} {...props} />);
CrumbLink.displayName = "CrumbLink";

type AnchorProps = ComponentPropsWithoutRef<"a"> & {
  "data-start-link"?: string;
  "data-form-id"?: string;
};

function SitePage() {
  const { page, formsUrl } = Route.useLoaderData();

  // A start link is the page's call to action, so it renders as a button; a
  // link with nowhere to go (no href, no form) renders as nothing.
  const ContentLink = ({
    "data-start-link": startLink,
    "data-form-id": formId,
    href,
    children,
    ...props
  }: AnchorProps) => {
    if (startLink === undefined) {
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    }
    const target = startLinkHref(formsUrl, href, formId);
    return target ? <LinkButton href={target}>{children}</LinkButton> : null;
  };

  // api_v2's trail includes the current page and not Home; the design
  // system's crumbs are the ancestors, from Home.
  const crumbs = [
    { href: "/", label: "Home" },
    ...page.breadcrumbs
      .slice(0, -1)
      .map((crumb) => ({ href: crumb.url, label: crumb.name })),
  ];

  return (
    <div className="site-page">
      <div className="site-crumbs">
        <Breadcrumbs
          items={crumbs}
          collapseOnMobile
          linkComponent={CrumbLink}
        />
      </div>
      <article className="govbb-prose">
        <h1>{page.frontmatter.title}</h1>
        {page.frontmatter.lede && (
          <p className="site-lede">{page.frontmatter.lede}</p>
        )}
        {toJsxRuntime(page.hast, {
          Fragment,
          jsx,
          jsxs,
          components: { a: ContentLink },
        })}
      </article>
    </div>
  );
}

function NotFound() {
  return (
    <article className="govbb-prose">
      <h1>Page not found</h1>
      <p>
        No public page in <code>content_pages</code> has that url.
      </p>
      <p>
        <Link to="/">Back to the index</Link>
      </p>
    </article>
  );
}
