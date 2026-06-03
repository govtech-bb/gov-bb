import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import type { SubmissionCreatedEvent } from "../forms/submissions/submissions.types";
import { generateApplicationCodeForService } from "./application-code";
import { buildWebhookFormData, extractApplicant } from "./applicant-extractor";
import { resolveServiceCodeFromFormId } from "./youth-opportunity-codes";
import { YouthOpportunityWebhookService } from "./youth-opportunity-webhook.service";

/**
 * Listens for persisted submissions and dispatches youth-opportunity ones to
 * the external case-management webhook. This is the server-side home of the
 * dispatch frontend-alpha used to perform in `sendFormSubmittedWebhook`.
 *
 * Runs alongside the existing SubmissionProcessorListener — both subscribe to
 * `submission.created`; event-emitter fans out to every listener.
 */
@Injectable()
export class YouthOpportunityWebhookListener {
  private readonly logger = new Logger(YouthOpportunityWebhookListener.name);

  constructor(private readonly webhook: YouthOpportunityWebhookService) {}

  @OnEvent("submission.created", { async: true })
  async handleSubmissionCreated(event: SubmissionCreatedEvent): Promise<void> {
    const serviceCode = resolveServiceCodeFromFormId(event.formId);
    if (!serviceCode) {
      // Either not a youth-opportunity form, or an unmapped one. Non-youth
      // forms are silently ignored; an unmapped youth form is worth flagging.
      if (event.formId.startsWith("youth-opportunity-")) {
        this.logger.warn(
          `[case-management] Unmapped youth-opportunity formId="${event.formId}" — no dispatch`,
        );
      }
      return;
    }

    const applicant = extractApplicant(event.values);
    const code = generateApplicationCodeForService(serviceCode);

    await this.webhook.dispatch({
      code,
      programmeCode: serviceCode,
      applicantName: applicant.name,
      applicantEmail: applicant.email,
      applicantPhone: applicant.phone,
      formData: buildWebhookFormData(event.values),
      submittedAt: event.meta.submittedAt,
    });
  }
}
