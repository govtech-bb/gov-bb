/**
 * Each environment's `service_status` (api v1, feature flagging) applied to
 * the estate snapshot at import time, with landing's mapping (ADR 0110):
 * `disabled` → preview, `enabled` → public, `form_disabled` and no row keep
 * the frontmatter level (#3188).
 */

import { z } from "zod";
import type { Visibility } from "./page";

export const ServiceStatus = z.enum(["enabled", "form_disabled", "disabled"]);
export type ServiceStatus = z.infer<typeof ServiceStatus>;

/** api v1's `GET /service_status` envelope, as a key → status map. */
export const ServiceStatuses = z
  .object({
    status: z.literal("success"),
    data: z.array(z.object({ slug: z.string().min(1), status: ServiceStatus })),
  })
  .transform(({ data }) => new Map(data.map((row) => [row.slug, row.status])));

export interface VisibilityChange {
  url: string;
  from: Visibility;
  to: Visibility;
}

const LEVEL: Partial<Record<ServiceStatus, Visibility>> = {
  disabled: "preview",
  enabled: "public",
};

/**
 * Landing's overlay (ADR 0110) on snapshot pages: key `form_id ??
 * content_slug`. Returns new pages and, in input order, those whose level
 * changed.
 */
export function applyServiceStatuses<
  T extends {
    url: string;
    form_id: string | null;
    content_slug: string;
    visibility: Visibility;
  },
>(
  pages: readonly T[],
  statuses: ReadonlyMap<string, ServiceStatus>,
): { pages: T[]; changes: VisibilityChange[] } {
  const changes: VisibilityChange[] = [];
  const overlaid = pages.map((page) => {
    const status = statuses.get(page.form_id ?? page.content_slug);
    const to = status && LEVEL[status];
    if (!to || to === page.visibility) return page;
    changes.push({ url: page.url, from: page.visibility, to });
    return { ...page, visibility: to };
  });
  return { pages: overlaid, changes };
}
