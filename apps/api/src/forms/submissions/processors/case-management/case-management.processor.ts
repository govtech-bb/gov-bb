import { Injectable, Logger } from "@nestjs/common";
import type {
  ISubmissionProcessor,
  ProcessorOutput,
} from "../submission-processor.interface";
import type { SubmissionCreatedEvent } from "../../submissions.types";
import { buildWebhookFormData, extractApplicant } from "./applicant-extractor";
import {
  generateApplicationCodeForService,
  isServiceCode,
} from "./application-code";
import { CaseManagementWebhookService } from "./case-management-webhook.service";
import { sanitizeForLog } from "./log-sanitize";

/**
 * Dispatches an accepted submission to the external case-management system.
 *
 * Replaces the old hardcoded `YouthOpportunityWebhookListener` + `formId`→code
 * table: a form now opts in via its recipe with
 * `{ type: "case-management", config: { programmeCode } }`, so which forms
 * dispatch is declared in the recipe rather than a backend string-prefix map.
 *
 * Non-gating: runs on the async processor path (SQS or direct), so a failed
 * delivery retries / lands in the DLQ per-entry rather than being dropped.
 */
@Injectable()
export class CaseManagementProcessor implements ISubmissionProcessor {
  readonly type = "case-management" as const;
  private readonly logger = new Logger(CaseManagementProcessor.name);

  constructor(private readonly webhook: CaseManagementWebhookService) {}

  async process(payload: SubmissionCreatedEvent): Promise<ProcessorOutput> {
    // Per-entry dispatch (issue #95): act on exactly the entry addressed by
    // processorIndex. In youth-opportunity recipes this entry sits after the
    // email processor (index 1), so never assume index 0.
    const index = payload.processorIndex ?? 0;
    const cfg = (payload.processors[index]?.config ?? {}) as Record<
      string,
      unknown
    >;
    const programmeCode = cfg["programmeCode"] as string | undefined;

    if (!programmeCode || !isServiceCode(programmeCode)) {
      // A misconfigured recipe should fail loudly (DLQ) rather than POST a bogus
      // programme_code the case-management system can't route.
      throw new Error(
        `[case-management] Unknown programmeCode "${sanitizeForLog(programmeCode)}" for submission ${payload.submissionId} — check the recipe processor config`,
      );
    }

    const applicant = extractApplicant(payload.values);

    await this.webhook.dispatch({
      code: generateApplicationCodeForService(programmeCode),
      programmeCode,
      applicantName: applicant.name,
      applicantEmail: applicant.email,
      applicantPhone: applicant.phone,
      formData: buildWebhookFormData(payload.values),
      submittedAt: payload.meta.submittedAt,
    });

    return { kind: "completed" };
  }
}
