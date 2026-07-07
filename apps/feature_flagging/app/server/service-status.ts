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
  .handler(async (): Promise<ServiceRow[]> => {
    const [services, forms, statuses] = await Promise.all([
      api
        .get<ServiceIndexEntry[]>("/services")
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
 * Set a service's status. The audit `author` is the authenticated GitHub login
 * from the session — never client-supplied.
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
    return api.put<StatusRow>("/service_status", {
      slug: data.slug,
      status: data.status,
      author: context.session.login,
    });
  });

/** A service's status-change history, newest first. */
export const getServiceAudit = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(z.object({ slug: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<AuditEntry[]> => {
    return api.get<AuditEntry[]>(
      `/service_status/audit?slug=${encodeURIComponent(data.slug)}`,
    );
  });
