import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * The spike's front door. api_v2 serves pages by url and has no list, so
 * this links a few seeded pages rather than listing the estate.
 */
export const Route = createFileRoute("/")({
  component: SiteIndex,
});

const EXAMPLES = [
  "/money-financial-support/calculate-severance-pay",
  "/work-employment/apply-to-be-a-project-protege-mentor",
  "/family-birth-relationships/get-birth-certificate",
  // A bare slug, which api_v2 redirects to its canonical url.
  "/calculate-severance-pay",
];

function SiteIndex() {
  return (
    <div className="site-index-page">
      <h1>Pages</h1>
      <p className="site-lede">
        Every page here is markdown stored in the database, served by api_v2 and
        compiled to hast on this site's server. Any path is resolved against{" "}
        <code>content_pages.url</code>.
      </p>
      <ul className="site-index">
        {EXAMPLES.map((url) => (
          <li key={url}>
            <Link to={url} className="site-index-link">
              {url}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
