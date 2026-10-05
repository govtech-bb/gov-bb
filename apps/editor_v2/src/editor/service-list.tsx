/**
 * The editor's front door: services, not pages.
 *
 * A flat list of every page stops being navigable somewhere around thirty
 * rows, and the estate has 116. More importantly it hides the structure the
 * content actually has — a service is the thing a content designer owns, and
 * its pages (entry, start, form, find) are parts of it rather than peers of
 * every other page on the site.
 *
 * So the hierarchy the address already encodes is the hierarchy you browse:
 * category → service → page → editor.
 */

import { CATEGORY_TAXONOMY } from "@govtech-bb/content/categories";
import {
  useCollections,
  useDocumentList,
  useReset,
} from "@govtech-bb/spike-db/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CATEGORY_SLUGS } from "./page-properties";
import { splitUrl } from "./page-url";
import { Button } from "../ui/Button";
import { DataTable } from "../ui/DataTable";
import { PageHeader, SectionLabel } from "../ui/PageHeader";

const CATEGORY_TITLES = new Map(
  CATEGORY_TAXONOMY.map((category) => [category.slug, category.title]),
);

/** The url segment standing in for "this page has no category". */
export const NO_CATEGORY = "_";

interface ServiceGroup {
  category: string;
  categoryTitle: string;
  services: Array<{ service: string; pages: number }>;
}

export function ServiceList() {
  const documents = useDocumentList();
  const collections = useCollections();
  const reset = useReset();
  const [resetting, setResetting] = useState(false);

  const groups = useMemo((): ServiceGroup[] => {
    const byCategory = new Map<string, Map<string, number>>();
    for (const doc of documents ?? []) {
      const { category, service } = splitUrl(doc.url, CATEGORY_SLUGS);
      const services = byCategory.get(category) ?? new Map<string, number>();
      services.set(service, (services.get(service) ?? 0) + 1);
      byCategory.set(category, services);
    }
    return [...byCategory.entries()]
      .map(([category, services]) => ({
        category,
        categoryTitle:
          CATEGORY_TITLES.get(category) ?? "Island-wide (no category)",
        services: [...services.entries()]
          .map(([service, pages]) => ({ service, pages }))
          .sort((a, b) => a.service.localeCompare(b.service)),
      }))
      .sort((a, b) => a.categoryTitle.localeCompare(b.categoryTitle));
  }, [documents]);

  const linkClass =
    "font-bold text-blue-100 hover:text-blue-00 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100";

  return (
    <div className="flex flex-col gap-m">
      <PageHeader
        title="Services"
        description="Every page belongs to a service, and every service to a category. Choose a service to see its pages."
        actions={
          /*
            Only where the backend will do it. Against the API this is absent
            rather than broken: wiping a shared estate is not something an
            unauthenticated button should offer.
          */
          reset ? (
            <Button
              type="button"
              variant="secondary"
              data-testid="reset-data"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                try {
                  await reset();
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? "Resetting…" : "Reset to the seeded content"}
            </Button>
          ) : undefined
        }
      />

      {documents === undefined ? (
        <p className="text-caption text-mid-grey-00">Loading…</p>
      ) : (
        <div data-testid="service-list" className="flex flex-col gap-m">
          {groups.map((group) => (
            <section key={group.category}>
              <SectionLabel>{group.categoryTitle}</SectionLabel>
              <DataTable
                rows={group.services}
                rowKey={(row) => row.service}
                empty={null}
                columns={[
                  {
                    key: "service",
                    header: "Service",
                    cell: ({ service }) => (
                      <Link
                        to="/editor/service/$category/$service"
                        params={{
                          category: group.category || NO_CATEGORY,
                          service,
                        }}
                        data-testid={`service-${service}`}
                        className={linkClass}
                      >
                        {service}
                      </Link>
                    ),
                  },
                  {
                    key: "pages",
                    header: "Pages",
                    numeric: true,
                    width: "w-[120px]",
                    cell: ({ pages }) =>
                      `${pages} ${pages === 1 ? "page" : "pages"}`,
                  },
                ]}
              />
            </section>
          ))}
        </div>
      )}

      <section>
        <SectionLabel>Collections</SectionLabel>
        <p className="mb-xs text-caption text-mid-grey-00 max-w-2xl">
          The data behind finders, calendars and tables. A block can be
          configured over a collection; this is where the collection itself is
          edited.
        </p>
        <DataTable
          data-testid="collection-list"
          rows={collections ?? []}
          rowKey={(collection) => collection.key}
          empty={null}
          columns={[
            {
              key: "title",
              header: "Collection",
              cell: (collection) => (
                <Link
                  to="/editor/collections/$key"
                  params={{ key: collection.key }}
                  data-testid={`collection-${collection.key}`}
                  className={linkClass}
                >
                  {collection.title}
                </Link>
              ),
            },
            {
              key: "key",
              header: "Key",
              cell: (collection) => (
                <code className="font-mono text-caption-sm text-mid-grey-00">
                  {collection.key}
                </code>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
