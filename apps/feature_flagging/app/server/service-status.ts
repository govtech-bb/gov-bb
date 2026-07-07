import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession } from "./auth/require-session";
import { api } from "./api-client";
import {
  reconcileCatalogue,
  type FormSummary,
  type ServiceRow,
  type StatusRow,
} from "../lib/catalogue";
import { LANDING_SERVICES } from "../lib/services-catalogue.generated";
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

/**
 * The full reconciled service catalogue with live status. Fetches the forms
 * list and current statuses from the api and merges them with the baked landing
 * catalogue (see app/lib/catalogue.ts).
 */
export const listServices = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<ServiceRow[]> => {
    const [forms, statuses] = await Promise.all([
      api.get<FormSummary[]>("/form-definitions"),
      api.get<StatusRow[]>("/service_status"),
    ]);
    return reconcileCatalogue({ landing: LANDING_SERVICES, forms, statuses });
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
