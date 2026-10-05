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
import { BackLink } from "./back-link";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";

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

/**
 * Where a service has both, the entry page at its root and the start page
 * under `/start` are both `service_start` documents — and on the live estate
 * they carry the same title. Naming the root one for what it is keeps the
 * pair from reading as a duplicate.
 */
function kindOf(
  doc: { url: string; document_type: string },
  hasStartPage: boolean,
): string {
  const { path } = splitUrl(doc.url, CATEGORY_SLUGS);
  if (hasStartPage && path === "" && doc.document_type === "service_start") {
    return "Entry page";
  }
  return TYPE_LABELS[doc.document_type] ?? doc.document_type;
}

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

  const hasStartPage = items.some(
    (doc) => splitUrl(doc.url, CATEGORY_SLUGS).path === "start",
  );

  const categoryTitle =
    CATEGORY_TITLES.get(category) ?? "Island-wide (no category)";

  return (
    <div>
      <BackLink />
      <PageHeader eyebrow={categoryTitle} title={service} />

      {documents === undefined ? (
        <p className="text-caption text-mid-grey-00">Loading…</p>
      ) : (
        <DataTable
          data-testid="service-items"
          rows={items}
          rowKey={(doc) => doc.id}
          empty={<EmptyState title="Nothing belongs to this service." />}
          columns={[
            {
              key: "title",
              header: "Title",
              cell: (doc) => (
                <Link
                  to="/editor/$id"
                  params={{ id: doc.id }}
                  data-testid={`item-${doc.id}`}
                  className="font-bold text-blue-100 hover:text-blue-00 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
                >
                  {doc.title}
                </Link>
              ),
            },
            {
              key: "kind",
              header: "Kind",
              cell: (doc) => kindOf(doc, hasStartPage),
            },
            {
              key: "path",
              header: "Path",
              cell: (doc) => {
                const { path } = splitUrl(doc.url, CATEGORY_SLUGS);
                return (
                  <code className="font-mono text-caption-sm text-mid-grey-00">
                    {path === "" ? "(service root)" : path}
                  </code>
                );
              },
            },
            {
              key: "saved",
              header: "Last saved",
              numeric: true,
              cell: (doc) => new Date(doc.updated_at).toLocaleTimeString(),
            },
          ]}
        />
      )}
    </div>
  );
}
