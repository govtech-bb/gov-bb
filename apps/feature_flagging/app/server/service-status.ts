import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession } from "./auth/require-session";
import { api } from "./api-client";
import {
  reconcileCatalogue,
  type FormSummary,
  type LandingService,
  type ServiceRow,
  type StatusRow,
} from "../lib/catalogue";
import {
  SERVICE_STATUS_VALUES,
  type ServiceStatus,
} from "../lib/service-status";
import { sendSlackNotification } from "../lib/slack-notif";

export interface AuditEntry {
  slug: string;
  oldState: ServiceStatus | null;
  newState: ServiceStatus;
  author: string;
  changedAt: string;
}

/** One entry from the api's `GET /services` content index. */
interface ServiceIndexEntry {
  slug: string;
  title: string;
  category?: string;
  formId?: string;
  visibility?: "public" | "preview" | "draft";
}

/** Map the api's services index into the reconciler's landing-service shape. */
export function mapServicesIndex(
  entries: ServiceIndexEntry[],
): LandingService[] {
  return entries.map((e) => ({
    contentSlug: e.slug,
    title: e.title,
    ...(e.category ? { category: e.category } : {}),
    ...(e.formId ? { formId: e.formId } : {}),
    ...(e.visibility ? { contentVisibility: e.visibility } : {}),
  }));
}

/**
 * The full reconciled service catalogue with live status. Fetches the content
 * index, forms list, and current statuses from the api and merges them (see
 * app/lib/catalogue.ts). The content index is fetched at runtime (not baked) so
 * new landing pages appear without redeploying this app. If `GET /services`
 * fails the tool degrades to forms + statuses rather than erroring out.
 */
export const listServices = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async ({ context }): Promise<ServiceRow[]> => {
    // Forward the user's GitHub token so /services returns non-public
    // (preview/draft) services too. The other two reads are public.
    const token = context.session.accessToken;
    const [services, forms, statuses] = await Promise.all([
      api
        .get<ServiceIndexEntry[]>("/services", token)
        .catch(() => [] as ServiceIndexEntry[]),
      api.get<FormSummary[]>("/form-definitions"),
      api.get<StatusRow[]>("/service_status"),
    ]);
    return reconcileCatalogue({
      landing: mapServicesIndex(services),
      forms,
      statuses,
    });
  });

/**
 * Set a service's status. Forwards the user's GitHub token; the API verifies it
 * and records the audit author from the verified login (never client-supplied).
 */
export const setServiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      slug: z.string().min(1).max(100),
      status: z.enum(
        SERVICE_STATUS_VALUES as [ServiceStatus, ...ServiceStatus[]],
      ),
    }),
  )
  .handler(async ({ data, context }): Promise<StatusRow> => {
    const result = await api.put<StatusRow>(
      "/service_status",
      { slug: data.slug, status: data.status },
      context.session.accessToken,
    );

    // Send a Slack notification if the status changed.
    if (result.status !== data.status) {
      const message = `${data.slug} status changed from ${result.status} to ${data.status}`;
      sendSlackNotification(message);
    }

    return result;
  });

/** A service's status-change history, newest first. */
export const getServiceAudit = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(z.object({ slug: z.string().min(1).max(100) }))
  .handler(async ({ data, context }): Promise<AuditEntry[]> => {
    return api.get<AuditEntry[]>(
      `/service_status/audit?slug=${encodeURIComponent(data.slug)}`,
      context.session.accessToken,
    );
  });
