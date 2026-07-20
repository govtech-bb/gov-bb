import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import type { SubmissionCreatedEvent } from "../forms/submissions/submissions.types";
import { generateApplicationCode } from "../forms/submissions/processors/application-code";
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
    // Smoke submissions must fire no real side-effects. This listener triggers
    // off `formId`, not `processors[]`, so the service's processor-drop does
    // not suppress it — short-circuit explicitly (#1252).
    if (event.isSmokeSubmission) return;

    // #841/#1458: FORM_ID_SERVICE_CODES is drained — every programme now
    // dispatches via the `webhook` processor in its recipe (code = the
    // submission's referenceCode). This listener is dormant: it resolves nothing
    // and dispatches nothing. Kept in place for a phased cutover; no "unmapped"
    // warning, since a youth-opportunity formId not being here is now expected,
    // not a misconfiguration.
    const serviceCode = resolveServiceCodeFromFormId(event.formId);
    if (!serviceCode) return;

    const applicant = extractApplicant(event.values);
    const code = generateApplicationCode(
      serviceCode,
      event.submissionId,
      event.meta.submittedAt,
    );

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
