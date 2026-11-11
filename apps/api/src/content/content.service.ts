import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { SERVICES_INDEX } from "./services-index.generated";
import type {
  ServiceIndexEntry,
  ServiceVisibility,
} from "./service-index.type";
import { ServiceStatusService } from "@/services/service-status.service";
import { ServiceStatus } from "@/database/entities/service-status.entity";

/** How long one api_v2 `/catalog` read serves `/services` (api_v2's own max-age). */
const CATALOG_TTL_MS = 60_000;
const CATALOG_TIMEOUT_MS = 5_000;

// One page of api_v2's `GET /catalog` (#3540). Unknown keys (description,
// digital, stage, subcategory) are dropped.
const catalogPage = z.object({
  url: z.string().startsWith("/"),
  slug: z.string().min(1),
  title: z.string(),
  // #3540 serves null outside the taxonomy; tolerate the key being absent too.
  category: z.string().nullable().optional(),
  form_id: z.string().nullable(),
  visibility: z.enum(["public", "preview"]),
});
const catalog = z.object({ pages: z.array(catalogPage) });

export type CatalogPage = z.infer<typeof catalogPage>;

export function toServiceIndexEntry(page: CatalogPage): ServiceIndexEntry {
  const segments = page.url.split("/").filter(Boolean);
  // ponytail: v1's slug doubles as the URL hint feature_flagging and analytics
  // build the landing link from (`category/slug` when it has no slash, the slug
  // verbatim when it has): #3540's leaf for /<category>/<leaf> and the bare
  // roots, the whole path for anything deeper. Carry `url` and let both read
  // it to retire this.
  const slug = segments.length > 2 ? segments.join("/") : page.slug;
  return {
    slug,
    title: page.title,
    ...(page.category ? { category: page.category } : {}),
    ...(page.form_id ? { formId: page.form_id } : {}),
    visibility: page.visibility,
  };
}

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
  private readonly logger = new Logger(ContentService.name);
  private readonly apiV2Url: string;
  private readonly previewToken: string;
  private cached?: { entries: ServiceIndexEntry[]; fetchedAt: number };
  private refreshing?: Promise<ServiceIndexEntry[]>;

  constructor(
    private readonly serviceStatus: ServiceStatusService,
    config: ConfigService,
  ) {
    this.apiV2Url = config.get<string>("API_V2_URL", "").replace(/\/+$/, "");
    this.previewToken = config.get<string>("RECIPE_PREVIEW_TOKEN", "");
    if (this.apiV2Url && !this.previewToken) {
      this.logger.warn(
        "API_V2_URL is set but RECIPE_PREVIEW_TOKEN is empty: /services reads api_v2's public catalog only",
      );
    }
  }

  /**
   * The services catalogue (slug/title/category/formId/visibility): api_v2's
   * `/catalog` when `API_V2_URL` is set (#3249), else the static snapshot.
   * Overridable in tests.
   */
  async index(): Promise<ServiceIndexEntry[]> {
    return this.apiV2Url ? this.fromApiV2() : SERVICES_INDEX;
  }

  /**
   * api_v2's catalog (public + preview pages, read with the preview token),
   * cached 60s. Once stale, the cached copy is served at once while one shared
   * refresh runs; a failed refresh keeps it for another 60s. A cold read waits
   * for the fetch, and a cold failure is a 503 that caches nothing.
   */
  private async fromApiV2(): Promise<ServiceIndexEntry[]> {
    if (this.cached && Date.now() - this.cached.fetchedAt < CATALOG_TTL_MS) {
      return this.cached.entries;
    }
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = undefined;
    });
    // A refresh with a cached copy never rejects (its catch serves the copy).
    return this.cached?.entries ?? this.refreshing;
  }

  private async refresh(): Promise<ServiceIndexEntry[]> {
    const now = Date.now();
    try {
      const response = await fetch(`${this.apiV2Url}/catalog`, {
        headers: this.previewToken
          ? { "x-preview-token": this.previewToken }
          : {},
        signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`status ${response.status}`);
      }
      const parsed = catalog.safeParse(await response.json());
      if (!parsed.success) throw new Error("unexpected body");
      const entries = parsed.data.pages
        .map(toServiceIndexEntry)
        .sort((a, b) => a.slug.localeCompare(b.slug));
      this.cached = { entries, fetchedAt: now };
      return entries;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (reason === "status 401") {
        this.logger.error(
          "api_v2 /catalog answered 401: RECIPE_PREVIEW_TOKEN does not match api_v2's PREVIEW_SECRET, or api_v2 has none",
        );
      } else {
        this.logger.warn(`api_v2 /catalog read failed: ${reason}`);
      }
      if (!this.cached) {
        throw new ServiceUnavailableException("Services index unavailable");
      }
      this.cached.fetchedAt = now;
      return this.cached.entries;
    }
  }

  /**
   * The category of the service page that links `formId`, for the forms app's
   * analytics events (#3250). Undefined when no service links the form, or
   * when the index is unavailable: an analytics tag must never fail a form load.
   */
  async categoryForForm(formId: string): Promise<string | undefined> {
    const entries = await this.index().catch(() => []);
    return entries.find((e) => e.formId === formId)?.category;
  }

  /**
   * In api_v2 mode, the catalog's own visibility; `service_status` is not read
   * (ADR 0110 "After cutover"). Otherwise the services index with visibility
   * derived from the runtime `service_status`
   * table (keyed by the canonical slug — `formId` when the service has a form,
   * else the content slug). `includeNonPublic` gates preview services — the
   * controller sets it true only for an authenticated admin request.
   */
  async list(includeNonPublic: boolean): Promise<ServiceIndexEntry[]> {
    if (this.apiV2Url) {
      return filterVisible(await this.index(), includeNonPublic);
    }
    const statuses = await this.serviceStatus.list();
    const statusBySlug = new Map(statuses.map((s) => [s.slug, s.status]));
    const entries = (await this.index()).map((e) => ({
      ...e,
      visibility: visibilityForStatus(statusBySlug.get(e.formId ?? e.slug)),
    }));
    return filterVisible(entries, includeNonPublic);
  }
}
