import { DEFAULT_STATUS, type ServiceStatus } from "./service-status";

/** A landing-content service, fetched at runtime from the api's `GET /services`. */
export interface LandingService {
  /** The landing content slug (hierarchical, e.g. `category/service`). */
  contentSlug: string;
  title: string;
  category?: string;
  /** The linked form recipe id, when the service has a form. */
  formId?: string;
  contentVisibility?: "public" | "preview" | "draft";
}

/** A form from the api's `GET /form-definitions`. */
export interface FormSummary {
  formId: string;
  title: string;
  category?: string;
}

/** A row from the api's `GET /service_status`. */
export interface StatusRow {
  slug: string;
  status: ServiceStatus;
}

/** A reconciled row shown in the admin table. */
export interface ServiceRow {
  /** Canonical slug: `formId` when the service has a form, else content slug. */
  slug: string;
  title: string;
  category?: string;
  hasForm: boolean;
  /** Landing URL (content slug) when the service has a landing page. */
  landingUrl?: string;
  contentVisibility?: "public" | "preview" | "draft";
  /** Current status; defaults to `enabled` when no service_status row exists. */
  status: ServiceStatus;
  /** True when this row exists only because of a stray service_status row. */
  orphan?: boolean;
}

export interface CatalogueInput {
  landing: LandingService[];
  forms: FormSummary[];
  statuses: StatusRow[];
}

/**
 * Reconcile the landing content, forms registry, and live service_status rows
 * into one list keyed by a single canonical slug (formId for form-backed
 * services, else the content slug — see #1898).
 */
export function reconcileCatalogue(input: CatalogueInput): ServiceRow[] {
  const byCanonical = new Map<string, ServiceRow>();

  // 1. Landing services. A service with a form_id is keyed by that formId so it
  //    reconciles with the forms registry below.
  for (const svc of input.landing) {
    const hasForm = Boolean(svc.formId);
    const slug = svc.formId ?? svc.contentSlug;
    byCanonical.set(slug, {
      slug,
      title: svc.title,
      category: svc.category,
      hasForm,
      landingUrl: svc.contentSlug,
      contentVisibility: svc.contentVisibility,
      status: DEFAULT_STATUS,
    });
  }

  // 2. Forms. Merge into an existing landing row (filling gaps, landing title
  //    wins) or add a form that has no landing page.
  for (const form of input.forms) {
    const existing = byCanonical.get(form.formId);
    if (existing) {
      existing.hasForm = true;
      existing.title ||= form.title;
      existing.category ??= form.category;
    } else {
      byCanonical.set(form.formId, {
        slug: form.formId,
        title: form.title,
        category: form.category,
        hasForm: true,
        status: DEFAULT_STATUS,
      });
    }
  }

  // 3. Overlay live status. A status row whose slug matches nothing is surfaced
  //    as an orphan so stray toggles are visible rather than silently dropped.
  for (const row of input.statuses) {
    const existing = byCanonical.get(row.slug);
    if (existing) {
      existing.status = row.status;
    } else {
      byCanonical.set(row.slug, {
        slug: row.slug,
        title: row.slug,
        hasForm: false,
        status: row.status,
        orphan: true,
      });
    }
  }

  return [...byCanonical.values()].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );
}

/**
 * The Type-column label for a row:
 * - `Content + Form` — a landing page that has a linked form.
 * - `Content`        — a landing page with no form.
 * - `Form only`      — a form with no landing page.
 * Returns `null` for an orphan (a stray status row with neither page nor form);
 * the table shows only the Orphan badge for those.
 */
export function serviceTypeLabel(row: ServiceRow): string | null {
  const hasContent = Boolean(row.landingUrl);
  if (hasContent) return row.hasForm ? "Content + Form" : "Content";
  if (row.hasForm) return "Form only";
  return null;
}

/** Columns the services table can sort by. */
export type SortKey = "service" | "category" | "type" | "status";
export type SortDir = "asc" | "desc";

// enabled first, then form_disabled, then disabled — so `status asc` floats the
// live services to the top.
const STATUS_RANK: Record<ServiceStatus, number> = {
  enabled: 0,
  form_disabled: 1,
  disabled: 2,
};

/**
 * Sort rows by a column. Title (case-insensitive) is always the tiebreak and is
 * NOT reversed by `dir`, so within any group the order stays alphabetical.
 * Default table sort is `status` asc → enabled at the top, alphabetical within.
 */
export function sortServiceRows(
  rows: ServiceRow[],
  key: SortKey,
  dir: SortDir,
): ServiceRow[] {
  const factor = dir === "asc" ? 1 : -1;
  const byTitle = (a: ServiceRow, b: ServiceRow) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  return [...rows].sort((a, b) => {
    let primary = 0;
    switch (key) {
      case "service":
        primary = byTitle(a, b);
        break;
      case "category":
        // Missing category sorts last regardless of direction's group order.
        primary = (a.category ?? "￿").localeCompare(
          b.category ?? "￿",
          undefined,
          { sensitivity: "base" },
        );
        break;
      case "type":
        // Form before Info in ascending order.
        primary = Number(b.hasForm) - Number(a.hasForm);
        break;
      case "status":
        primary = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        break;
    }
    return primary !== 0 ? primary * factor : byTitle(a, b);
  });
}
