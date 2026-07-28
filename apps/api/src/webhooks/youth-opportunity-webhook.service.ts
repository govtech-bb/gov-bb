import { HttpService } from "@nestjs/axios";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import webhooksConfig from "../config/webhooks.config";
import { sanitizeForLog } from "./log-sanitize";
import { timedPost } from "@/forms/submissions/processors/http-post";

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
      // Send via the shared timedPost primitive so maxRedirects:0 blocks a 3xx
      // to an internal host (e.g. cloud metadata) — the SSRF vector for an
      // otherwise-trusted, operator-configured endpoint (#2000). The env URL is
      // deliberately NOT run through assertSafeUrl: per #287 an operator's
      // deploy config may legitimately be internal, so env endpoints are exempt.
      await timedPost(this.http, endpoint, JSON.stringify(body), {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.config.secret,
        },
        timeoutMs: this.config.timeoutMs,
      });
      this.logger.log(
        `[case-management] Delivered ${sanitizeForLog(payload.code)} (${sanitizeForLog(payload.programmeCode)})`,
      );
    } catch (err) {
      this.logger.error(
        `[case-management] Failed to deliver ${sanitizeForLog(payload.code)} (${sanitizeForLog(payload.programmeCode)}) to ${endpoint}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
