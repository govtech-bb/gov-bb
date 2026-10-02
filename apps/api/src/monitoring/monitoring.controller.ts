import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminTokenGuard } from "@/common/guards/admin-token.guard";
import { ApiResponse } from "@/common/response";
import type { ApiResponseShape } from "@/common/response";
import { NotificationLogRepository } from "@/forms/submissions/notification-log.repository";
import {
  WebhookDestinationsService,
  type WebhookDestinationsAudit,
} from "@/forms/webhook-destinations/webhook-destinations.service";

/** Read-only projection returned to the monitoring console's Delivery tab. */
export interface NotificationLogRow {
  referenceCode: string | null;
  formId: string;
  recipientKind: string;
  recipient: string | null;
  outcome: string;
  providerMessageId: string | null;
  /** SES-reconciled delivery truth (delivered/bounced/complained/rejected);
   *  null until the SesEventConsumer fills it. The console prefers this over
   *  its address-shape bounce heuristic. */
  deliveryStatus: string | null;
  createdAt: string;
}

/**
 * Internal monitoring surface. `GET /monitoring/notification-log` returns this
 * environment's recent email-send outcomes so the observability console can
 * render MDA/citizen delivery status across envs without cross-account/cross-VPC
 * database access — each env's API reads its own RDS and serves it over HTTPS.
 *
 * Auth: a shared secret (`MONITORING_API_TOKEN`) via `Authorization: Bearer`,
 * enforced by `AdminTokenGuard` (applied as an INSTANCE — see that guard's
 * boot-safety note). The response carries PII (recipient addresses), so the
 * guard fails closed in production (unset token → 500, never un-gated) and the
 * only intended caller is the console, itself behind GitHub-org OAuth. NOT on
 * the `admin/` path prefix (that prefix is WAF-blocked and pinned to
 * AdminTokenGuard by a coverage spec) — `monitoring/` keeps it reachable by the
 * console while still secret-gated.
 */
@ApiTags("Monitoring")
@Controller("monitoring")
@Throttle({
  short: { limit: 5, ttl: 10_000 },
  medium: { limit: 30, ttl: 60_000 },
})
export class MonitoringController {
  constructor(
    private readonly notificationLog: NotificationLogRepository,
    private readonly webhookDestinations: WebhookDestinationsService,
  ) {}

  @Get("webhook-destinations")
  @ApiBearerAuth()
  @UseGuards(new AdminTokenGuard("MONITORING_API_TOKEN"))
  webhookDestinationsAudit(): ApiResponseShape<WebhookDestinationsAudit> {
    // The deploy-time per-MDA destinations audit (#1920/#2020): JSON parse
    // issues + ministries a form points at that have no entry in the secret.
    // Carries no secret values — only ministry keys and structural messages.
    return ApiResponse.success(this.webhookDestinations.getAudit(), {
      message: "Webhook destinations audit retrieved",
    });
  }

  @Get("notification-log")
  @ApiBearerAuth()
  @UseGuards(new AdminTokenGuard("MONITORING_API_TOKEN"))
  async recentNotifications(
    @Query("limit") limit?: string,
  ): Promise<ApiResponseShape<NotificationLogRow[]>> {
    const rows = await this.notificationLog.findRecent(
      limit ? Number(limit) : 200,
    );
    const data: NotificationLogRow[] = rows.map((r) => ({
      referenceCode: r.referenceCode,
      formId: r.formId,
      recipientKind: r.recipientKind,
      recipient: r.recipient,
      outcome: r.outcome,
      providerMessageId: r.providerMessageId,
      deliveryStatus: r.deliveryStatus,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    }));
    return ApiResponse.success(data, {
      message: "Recent notification outcomes retrieved",
    });
  }
}
