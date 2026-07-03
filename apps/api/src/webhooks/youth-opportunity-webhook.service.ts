import { HttpService } from "@nestjs/axios";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import webhooksConfig from "../config/webhooks.config";
import { sanitizeForLog } from "@/common/log-sanitize";

/**
 * Body posted to the case-management webhook. Field names are snake_case to
 * stay byte-compatible with the payload frontend-alpha sent.
 */
export interface FormSubmittedWebhookPayload {
  code: string;
  programmeCode: string;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  formData: Record<string, unknown>;
  submittedAt: string;
}

/**
 * Dispatches an accepted youth-opportunity submission to the external
 * case-management webhook — the server-side replacement for frontend-alpha's
 * `sendFormSubmittedWebhook` action. Errors are logged, never thrown: dispatch
 * runs after the submission is already persisted and acknowledged.
 */
@Injectable()
export class YouthOpportunityWebhookService {
  private readonly logger = new Logger(YouthOpportunityWebhookService.name);

  constructor(
    private readonly http: HttpService,
    @Inject(webhooksConfig.KEY)
    private readonly config: ConfigType<typeof webhooksConfig>,
  ) {}

  /**
   * Resolves `api/webhooks/form-submitted` against the configured base URL,
   * tolerating a missing trailing slash — same approach as the frontend.
   */
  private endpoint(): string {
    const base = this.config.url.endsWith("/")
      ? this.config.url
      : `${this.config.url}/`;
    return new URL("api/webhooks/form-submitted", base).toString();
  }

  async dispatch(payload: FormSubmittedWebhookPayload): Promise<void> {
    if (!(this.config.url && this.config.secret)) {
      this.logger.warn(
        `[case-management] Not configured (WEBHOOK_URL/WEBHOOK_SECRET) — skipping dispatch for ${sanitizeForLog(payload.code)}`,
      );
      return;
    }

    const endpoint = this.endpoint();
    const body = {
      code: payload.code,
      programme_code: payload.programmeCode,
      applicant: {
        name: payload.applicantName,
        email: payload.applicantEmail,
        phone: payload.applicantPhone,
      },
      form_data: payload.formData,
      submitted_at: payload.submittedAt,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(endpoint, body, {
          timeout: this.config.timeoutMs,
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.config.secret,
          },
        }),
      );
      this.logger.log(
        `[case-management] Delivered ${sanitizeForLog(payload.code)} (${sanitizeForLog(payload.programmeCode)}) — HTTP ${response.status}`,
      );
    } catch (err) {
      this.logger.error(
        `[case-management] Failed to deliver ${sanitizeForLog(payload.code)} (${sanitizeForLog(payload.programmeCode)}) to ${endpoint}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
