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
import { mrkdwnEscape, sendSlackNotification } from "./slack-notif";

export interface AuditEntry {
  slug: string;
  oldState: ServiceStatus | null;
  newState: ServiceStatus;
  author: string;
  changedAt: string;
}

/** The PUT /service_status response — StatusRow plus the pre-update status. */
interface StatusUpdateResult extends StatusRow {
  previousStatus: ServiceStatus | null;
  /** Audit author (guard-verified GitHub login). Absent from older API deploys. */
  author?: string;
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
      title: z.string().min(1).max(300),
      url: z.url().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<StatusUpdateResult> => {
    const result = await api.put<StatusUpdateResult>(
      "/service_status",
      { slug: data.slug, status: data.status },
      context.session.accessToken,
    );

    // Notify Slack only when the status actually changed. The API reports the
    // pre-update status as `previousStatus` (an idempotent no-op returns
    // previousStatus === status; a first-ever set returns null). The author is
    // the audit-log value the API recorded; the session login (same GitHub
    // identity) covers a deployed API that predates the `author` field. The
    // title/url describe the service's public page; incoming webhooks render
    // `<url|text>` as a mrkdwn link.
    if (result.previousStatus !== result.status) {
      const author = result.author ?? context.session.login;
      const title = mrkdwnEscape(data.title);
      // Link only http(s) URLs free of mrkdwn control characters — a `>` or
      // `|` inside the URL would break out of the `<url|text>` link syntax
      // (the same breakout class mrkdwnEscape closes for the title).
      const url =
        data.url && /^https?:\/\//.test(data.url) && !/[<>|]/.test(data.url)
          ? data.url
          : undefined;
      const subject = url ? `<${url}|${title}>` : title;
      const message = `"${subject}" has been changed from \`${result.previousStatus ?? "unset"}\` to \`${result.status}\` by \`${author}\``;
      await sendSlackNotification(message);
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
