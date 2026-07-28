import type { ServiceStatus } from "../src/entities";

/**
 * Pure derivation of the one-time `service_status` seed (#1650) from the
 * platform's current *static* visibility. Given the landing content index and
 * the flat recipe visibilities, it produces one row per service capturing the
 * state the #1898 admin UI should show from day one.
 *
 * Kept free of filesystem/network so it is fully unit-testable. The `ServiceStatus`
 * import is **type-only** and the status values are declared as local runtime
 * constants: importing the entity module at runtime would pull in TypeORM's
 * decorated classes, which the tsx generator
 * (`scripts/generate-service-status-seed.ts`) can't evaluate. The `SeedStatus`
 * alias below is derived from the enum, so any drift is a compile error.
 */

/** The three `service_status` states, as the enum's string values. */
export type SeedStatus = `${ServiceStatus}`;
const ENABLED: SeedStatus = "enabled";
const FORM_DISABLED: SeedStatus = "form_disabled";
const DISABLED: SeedStatus = "disabled";

/** Landing content visibility (mirrors the frontmatter enum; no `maintenance`). */
export type SeedContentVisibility = "public" | "preview" | "draft";

/** Form recipe visibility (`getRecipeVisibility`; adds `maintenance`). */
export type SeedFormVisibility = "public" | "preview" | "draft" | "maintenance";

/** One content-index entry, shaped like #1911's `ServiceIndexEntry`. */
export interface SeedContentEntry {
  slug: string;
  formId?: string;
  visibility: SeedContentVisibility;
}

export interface SeedRow {
  slug: string;
  status: SeedStatus;
}

export interface ServiceStatusSeedResult {
  rows: SeedRow[];
  warnings: string[];
}

/**
 * The **canonical slug** (pinned by #1898): the frontmatter `form_id` when the
 * page declares one — even if it matches no recipe, because both consumers look
 * up by the declared binding — otherwise the content slug. Form-only services
 * key by the recipe `formId`.
 */
export function buildServiceStatusSeed(
  contentEntries: SeedContentEntry[],
  formVisibilities: Record<string, SeedFormVisibility>,
): ServiceStatusSeedResult {
  const warnings: string[] = [];
  const rows: SeedRow[] = [];
  // slug → human description of what produced it, for the dedupe error message.
  const seen = new Map<string, string>();

  function addRow(slug: string, status: SeedStatus, source: string): void {
    const prior = seen.get(slug);
    if (prior !== undefined) {
      throw new Error(
        `Duplicate canonical slug "${slug}": produced by ${prior} and ${source}. ` +
          `Resolve the conflicting declaration before regenerating the seed.`,
      );
    }
    seen.set(slug, source);
    rows.push({ slug, status });
  }

  // Content pages. A form_id claimed here means the matching recipe is NOT
  // also emitted as a form-only row below.
  const claimedFormIds = new Set<string>();
  for (const entry of contentEntries) {
    if (entry.formId) claimedFormIds.add(entry.formId);
  }

  for (const entry of contentEntries) {
    const slug = entry.formId ?? entry.slug;
    const source = `content page "${entry.slug}"`;
    let status: SeedStatus;

    if (entry.visibility !== "public") {
      // preview / draft page → the whole service is hidden.
      status = DISABLED;
    } else if (!entry.formId) {
      // Public info-only page (no form). Seeds `enabled`; flagged per Isaiah so
      // a page that should have a form isn't silently baselined as fully live.
      status = ENABLED;
      warnings.push(
        `info-only page "${entry.slug}" declares no form_id — seeded "enabled".`,
      );
    } else {
      const formVis = formVisibilities[entry.formId];
      if (formVis === undefined) {
        // Public page bound to a form_id with no matching recipe.
        status = FORM_DISABLED;
        warnings.push(
          `page "${entry.slug}" declares form_id "${entry.formId}" but no recipe ` +
            `matches it — seeded "form_disabled".`,
        );
      } else if (formVis === "public") {
        status = ENABLED;
      } else {
        // preview / draft / maintenance form under a public page.
        status = FORM_DISABLED;
      }
    }

    addRow(slug, status, source);
  }

  // Form-only services: recipes with no landing page. Sorted for a stable
  // dedupe-error message; final ordering is handled below.
  for (const formId of Object.keys(formVisibilities).sort((a, b) =>
    a.localeCompare(b),
  )) {
    if (claimedFormIds.has(formId)) continue;
    const status = formVisibilities[formId] === "public" ? ENABLED : DISABLED;
    addRow(formId, status, `form-only recipe "${formId}"`);
  }

  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  return { rows, warnings };
}
