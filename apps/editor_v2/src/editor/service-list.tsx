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
import { reset } from "@govtech-bb/spike-db";
import {
  useCollections,
  useDb,
  useDocumentList,
} from "@govtech-bb/spike-db/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CATEGORY_SLUGS } from "./page-properties";
import { splitUrl } from "./page-url";
import { Button } from "@govtech-bb/react";

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
  const db = useDb();
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

  return (
    <div className="ed-page">
      <h1>Services</h1>
      <p className="ed-lede">
        Every page belongs to a service, and every service to a category. Choose
        a service to see its pages.
      </p>

      <p>
        <Button
          type="button"
          variant="secondary"
          data-testid="reset-data"
          disabled={resetting}
          onClick={async () => {
            setResetting(true);
            try {
              await reset(db);
            } finally {
              setResetting(false);
            }
          }}
        >
          {resetting ? "Resetting…" : "Reset to the seeded content"}
        </Button>
      </p>

      {documents === undefined ? (
        <p>Loading…</p>
      ) : (
        <div data-testid="service-list">
          {groups.map((group) => (
            <section key={group.category} className="ed-group">
              <h2 className="ed-group-title">{group.categoryTitle}</h2>
              <ul className="ed-service-list">
                {group.services.map(({ service, pages }) => (
                  <li key={service}>
                    <Link
                      to="/editor/service/$category/$service"
                      params={{
                        category: group.category || NO_CATEGORY,
                        service,
                      }}
                      data-testid={`service-${service}`}
                    >
                      {service}
                    </Link>
                    <span className="ed-count">
                      {pages} {pages === 1 ? "page" : "pages"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="ed-group">
        <h2 className="ed-group-title">Collections</h2>
        <p className="ed-lede">
          The data behind finders, calendars and tables. A block can be
          configured over a collection; this is where the collection itself is
          edited.
        </p>
        <ul className="ed-service-list" data-testid="collection-list">
          {(collections ?? []).map((collection) => (
            <li key={collection.key}>
              <Link
                to="/editor/collections/$key"
                params={{ key: collection.key }}
                data-testid={`collection-${collection.key}`}
              >
                {collection.title}
              </Link>
              <span className="ed-count">{collection.key}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
