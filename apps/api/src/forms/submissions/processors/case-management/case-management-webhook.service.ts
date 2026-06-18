import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import webhooksConfig from "../../../../config/webhooks.config";
import { sanitizeForLog } from "./log-sanitize";

/**
 * Body posted to the case-management webhook. Field names are snake_case to
 * stay byte-compatible with the payload frontend-alpha sent.
 */
export interface FormSubmittedWebhookPayload {
  /**
   * Canonical public reference — the submission's referenceCode (#1458). This
   * is the single shared identifier between the two systems, so it doubles as
   * the join key; no separate internal UUID is sent.
   */
  code: string;
  programmeCode: string;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  formData: Record<string, unknown>;
  submittedAt: string;
}

/**
 * Posts an accepted submission to the external case-management system — the
 * server-side replacement for frontend-alpha's `sendFormSubmittedWebhook`.
 *
 * Invoked from the `case-management` submission processor. Unlike the old
 * fire-and-forget listener, `dispatch` THROWS on a transport/HTTP failure so the
 * processor framework's per-entry retry/DLQ handles it. When the integration is
 * unconfigured (no WEBHOOK_URL/WEBHOOK_SECRET) it skips quietly — dispatch is a
 * no-op rather than an error, matching the old frontend behavior.
 */
@Injectable()
export class CaseManagementWebhookService {
  private readonly logger = new Logger(CaseManagementWebhookService.name);

  constructor(
    @Inject(webhooksConfig.KEY)
    private readonly config: ConfigType<typeof webhooksConfig>,
  ) {}

  /**
   * Resolves the configured path against the base URL, tolerating a missing
   * trailing slash on the base and a leading slash on the path.
   */
  private endpoint(): string {
    const base = this.config.url.endsWith("/")
      ? this.config.url
      : `${this.config.url}/`;
    const path = this.config.path.replace(/^\/+/, "");
    return new URL(path, base).toString();
  }

  /** True when the integration has both a base URL and an API key configured. */
  isConfigured(): boolean {
    return Boolean(this.config.url && this.config.secret);
  }

  async dispatch(payload: FormSubmittedWebhookPayload): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `[case-management] Not configured (WEBHOOK_URL/WEBHOOK_SECRET) — skipping dispatch for ${sanitizeForLog(payload.code)}`,
      );
      return;
    }

    const endpoint = this.endpoint();
    const body = JSON.stringify({
      code: payload.code,
      programme_code: payload.programmeCode,
      applicant: {
        name: payload.applicantName,
        email: payload.applicantEmail,
        phone: payload.applicantPhone,
      },
      form_data: payload.formData,
      submitted_at: payload.submittedAt,
    });

    // Log the outbound payload before dispatch. The body carries user-supplied
    // values, so it is passed through sanitizeForLog: strips control characters
    // (log injection, CWE-117) and bounds the length so an oversized field can't
    // flood the logs. Note it still contains applicant PII — keep it out of
    // long-retention log sinks.
    this.logger.log(
      `[case-management] POST ${sanitizeForLog(endpoint)} payload: ${sanitizeForLog(body)}`,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.config.secret,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(
        `[case-management] ${endpoint} responded with HTTP ${response.status} for ${sanitizeForLog(payload.code)} (${sanitizeForLog(payload.programmeCode)})`,
      );
    }

    this.logger.log(
      `[case-management] Delivered ${sanitizeForLog(payload.code)} (${sanitizeForLog(payload.programmeCode)}) — HTTP ${response.status}`,
    );
  }
}
