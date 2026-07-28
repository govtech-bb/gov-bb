/** A service's rollout-gate visibility, mirroring the frontmatter enum. */
export type ServiceVisibility = "public" | "preview" | "draft";

/** The subset of a service's fields needed to build the runtime services index. */
export interface ServiceIndexSource {
  slug: string;
  title: string;
  category?: string;
  categories?: string[];
  form_id?: string;
  visibility?: ServiceVisibility;
}

/** One entry in the runtime services index served by apps/api's `GET /services`. */
export interface ServiceIndexEntry {
  /** The landing content slug (hierarchical, e.g. `category/service`). */
  slug: string;
  title: string;
  /** Primary category slug: `categories[0] ?? category`. */
  category?: string;
  /** Linked form recipe id, when the service has a form. */
  formId?: string;
  visibility: ServiceVisibility;
}

/**
 * Build the services index from loaded content: one entry per service with the
 * metadata the feature-flagging tool needs, sorted by slug for stable generated
 * output. Pure — decoupled from the filesystem for testing and generation.
 */
export function buildServicesIndex(
  services: ServiceIndexSource[],
): ServiceIndexEntry[] {
  return services
    .map((s): ServiceIndexEntry => {
      const category = s.categories?.[0] ?? s.category;
      return {
        slug: s.slug,
        title: s.title,
        ...(category ? { category } : {}),
        ...(s.form_id ? { formId: s.form_id } : {}),
        visibility: s.visibility ?? "public",
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
