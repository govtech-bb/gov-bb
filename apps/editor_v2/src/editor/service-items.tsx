/**
 * One service, and the things that belong to it.
 *
 * "Items" rather than "pages" because a service is not only pages: the
 * severance service is an entry page plus a calculator, the Crop Over
 * service is a guide plus a form. The spike only stores page documents, so
 * everything here is one today — but the list is grouped by document type so
 * the distinction is visible rather than flattened away, which is the shape
 * a real implementation needs when forms arrive alongside pages.
 */

import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
import { useDocumentList } from "@govtech-bb/spike-db/react";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { CATEGORY_SLUGS } from "./page-properties";
import { splitUrl } from "./page-url";
import { NO_CATEGORY } from "./service-list";

const CATEGORY_TITLES = new Map(
  CATEGORY_TAXONOMY.map((category) => [category.slug, category.title]),
);

/** `service_start` reads better as "Start page" in a list of things. */
const TYPE_LABELS: Record<string, string> = {
  service_start: "Start page",
  service_form: "Form",
  licence_guide: "Guide",
  bank_holidays: "Calendar",
  pharmacy_finder: "Finder",
};

export function ServiceItems() {
  const { category, service } = useParams({
    from: "/editor/service/$category/$service",
  });
  const documents = useDocumentList();

  const items = useMemo(
    () =>
      (documents ?? []).filter((doc) => {
        const address = splitUrl(doc.url, CATEGORY_SLUGS);
        const docCategory = address.category || NO_CATEGORY;
        return docCategory === category && address.service === service;
      }),
    [documents, category, service],
  );

  const categoryTitle =
    CATEGORY_TITLES.get(category) ?? "Island-wide (no category)";

  return (
    <div className="ed-page">
      <p className="ed-breadcrumb">
        <Link to="/editor">← Services</Link>
        <span className="ed-count">{categoryTitle}</span>
      </p>

      <h1>{service}</h1>

      {documents === undefined ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>Nothing belongs to this service.</p>
      ) : (
        <table className="ed-table" data-testid="service-items">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Kind</th>
              <th scope="col">Path</th>
              <th scope="col">Last saved</th>
            </tr>
          </thead>
          <tbody>
            {items.map((doc) => {
              const { path } = splitUrl(doc.url, CATEGORY_SLUGS);
              return (
                <tr key={doc.id}>
                  <td>
                    <Link
                      to="/editor/$id"
                      params={{ id: doc.id }}
                      data-testid={`item-${doc.id}`}
                    >
                      {doc.title}
                    </Link>
                  </td>
                  <td>{TYPE_LABELS[doc.document_type] ?? doc.document_type}</td>
                  <td>
                    <code>{path === "" ? "(service root)" : path}</code>
                  </td>
                  <td>{new Date(doc.updated_at).toLocaleTimeString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
