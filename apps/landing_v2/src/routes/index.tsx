import { createFileRoute, Link } from "@tanstack/react-router";
import { listPages } from "../server/pages";

export const Route = createFileRoute("/")({
  // Resolved before the component renders, on the server for the first
  // request and through landing_v2's own server after that — never from the
  // browser to api_v2. There is no state in which this list is unknown.
  loader: async () => ({ pages: await listPages() }),
  component: SiteIndex,
});

function SiteIndex() {
  const { pages } = Route.useLoaderData();

  return (
    <div className="site-index-page">
      <h1>Pages</h1>
      <p className="site-lede">
        Every page here is stored as a block document and rendered from the
        database. Nothing on this list is a file.
      </p>
      <ul className="site-index">
        {pages.map((page) => (
          <li key={page.id}>
            <Link to={page.url} className="site-index-link">
              {page.title}
            </Link>
            <p className="site-index-meta">
              {page.url} · {page.schema_name} · {page.document_type}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
