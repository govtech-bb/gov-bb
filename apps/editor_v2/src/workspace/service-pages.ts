import type { ApiPage, ServiceDetail, ServicePage, ServiceSummary } from "../api/client";
import type { PageDocument, ServicePageRole } from "./model";

const ROLE_ORDER: Record<ServicePageRole, number> = { entry: 0, start: 1, supporting: 2 };

/** A page of an opened service as the workspace lists it. */
export function pageDocumentFromApi(page: {
  id: string;
  title: string;
  role: ServicePageRole;
}): PageDocument {
  return {
    id: page.id,
    title: page.title,
    kind: "page",
    role: page.role,
  };
}

/**
 * A row of a service's sidebar: the page it opens, how far it sits below the service's top level (the entry
 * page and the pages directly under it are at 0), and how far it is published, for a page from the content API.
 */
export type ServiceNavRow = {
  document: PageDocument;
  depth: number;
  visibility?: ServicePage["visibility"];
};

/**
 * An opened service's rows: the entry page, then each page before the pages under it, a start page first among its
 * siblings and the rest as the API orders them. A page whose parent isn't listed is kept, at the top.
 */
export function remoteServiceRows(detail: ServiceDetail): ServiceNavRow[] {
  const listed = new Set(detail.pages.map((page) => page.id));

  const children = Map.groupBy(detail.pages, (page) =>
    page.parent_id !== null && listed.has(page.parent_id) ? page.parent_id : null,
  );

  const rows = (parent: string | null, depth: number): ServiceNavRow[] =>
    (children.get(parent) ?? [])
      .toSorted((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
      .flatMap((page) => [
        {
          document: pageDocumentFromApi(page),
          depth: Math.max(0, depth - 1),
          visibility: page.visibility,
        },
        ...rows(page.id, depth + 1),
      ]);

  return rows(null, 0);
}

/** A service from the content API as the services list knows it, before its pages load: just its entry page. */
export const listedServiceRows = (service: ServiceSummary): ServiceNavRow[] => [
  {
    document: pageDocumentFromApi({ id: service.id, title: service.title, role: "entry" }),
    depth: 0,
    visibility: service.visibility,
  },
];

/** A page's role from the page alone, for a page opened before its service has loaded. */
export function inferServicePageRole(page: ApiPage): ServicePageRole {
  if (page.parent_id === null) return "entry";

  return page.slug === "start" ? "start" : "supporting";
}
