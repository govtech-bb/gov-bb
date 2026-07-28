/** A service's rollout-gate visibility (mirrors the landing frontmatter enum). */
export type ServiceVisibility = "public" | "preview" | "draft";

/**
 * One entry in the runtime services index served by `GET /services`. Sourced
 * from the landing content index at build time (see
 * scripts/generate-services-index.ts) and compiled into the api's own bundle —
 * the api takes no runtime dependency on `@govtech-bb/content`.
 */
export interface ServiceIndexEntry {
  /** The landing content slug (hierarchical, e.g. `category/service`). */
  slug: string;
  title: string;
  /** Primary category slug. */
  category?: string;
  /** Linked form recipe id, when the service has a form. */
  formId?: string;
  visibility: ServiceVisibility;
}
