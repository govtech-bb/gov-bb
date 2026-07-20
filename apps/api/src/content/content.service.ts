import { Injectable } from "@nestjs/common";
import { SERVICES_INDEX } from "./services-index.generated";
import type {
  ServiceIndexEntry,
  ServiceVisibility,
} from "./service-index.type";
import { ServiceStatusService } from "@/services/service-status.service";
import { ServiceStatus } from "@/database/entities/service-status.entity";

/** Keep only public entries unless non-public (preview/draft) are requested. */
export function filterVisible(
  entries: ServiceIndexEntry[],
  includeNonPublic: boolean,
): ServiceIndexEntry[] {
  return includeNonPublic
    ? entries
    : entries.filter((e) => e.visibility === "public");
}

/**
 * The `/services` visibility a runtime `service_status` maps to. Visibility is
 * derived solely from the DB — never the build-time frontmatter — so an admin
 * toggle is the single source of truth:
 *
 * - `enabled` / `form_disabled` → `public`: the service page stays listed; a
 *   `form_disabled` service only gates its form, not the page.
 * - `disabled` → `preview`: the whole service is hidden from the public.
 * - no row (`undefined`) → `preview`: fail-closed, so an unseeded service is
 *   never exposed publicly by default.
 */
export function visibilityForStatus(
  status: ServiceStatus | undefined,
): ServiceVisibility {
  return status === undefined || status === ServiceStatus.DISABLED
    ? "preview"
    : "public";
}

@Injectable()
export class ContentService {
  constructor(private readonly serviceStatus: ServiceStatusService) {}

  /** The static services catalogue (slug/title/category/formId). Overridable in tests. */
  index(): ServiceIndexEntry[] {
    return SERVICES_INDEX;
  }

  /**
   * The services index with visibility derived from the runtime `service_status`
   * table (keyed by the canonical slug — `formId` when the service has a form,
   * else the content slug). `includeNonPublic` gates preview services — the
   * controller sets it true only for an authenticated admin request.
   */
  async list(includeNonPublic: boolean): Promise<ServiceIndexEntry[]> {
    const statuses = await this.serviceStatus.list();
    const statusBySlug = new Map(statuses.map((s) => [s.slug, s.status]));
    const entries = this.index().map((e) => ({
      ...e,
      visibility: visibilityForStatus(statusBySlug.get(e.formId ?? e.slug)),
    }));
    return filterVisible(entries, includeNonPublic);
  }
}
