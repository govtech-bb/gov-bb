import type { ApiPage, ServiceDetail } from "../api/client";
import { documentKeys, type PageDocument, type ServicePageRole } from "./model";

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
    keys: documentKeys(page.id),
  };
}

/** A service's pages: the entry page, its start page, then the rest as the API orders them. */
export function servicePageDocuments(detail: ServiceDetail) {
  return detail.pages
    .map(pageDocumentFromApi)
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/** A page's role from the page alone, for a page opened before its service has loaded. */
export function inferServicePageRole(page: ApiPage): ServicePageRole {
  if (page.parent_id === null) return "entry";

  return page.slug === "start" ? "start" : "supporting";
}
