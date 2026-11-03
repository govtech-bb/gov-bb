import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FormSubmissionRepository } from "../form-submission.repository";
import { SubmissionPipelineService } from "../submission-pipeline.service";
import { sendsToCams } from "../processors/webhook-mapping";

/**
 * The answer to "where is application <reference>?", as the chat reads it
 * (govbb-chatbot `getSubmissionStatus`). Nothing beyond these fields: no
 * applicant data, no form values.
 */
export type SubmissionStatusAnswer =
  | {
      kind: "untracked";
      reference: string;
      receivedAt: string;
      /** So the chat can name the service and link its page (#3434). */
      formId: string;
    }
  | { kind: "not_found"; reference: string };

/**
 * Looks an application up by reference for the chat (#3419). Knowing the
 * reference is the access, as on the application tracker, so every answer
 * here is safe to give anyone who has it.
 */
@Injectable()
export class SubmissionStatusService {
  constructor(
    private readonly submissions: FormSubmissionRepository,
    private readonly pipeline: SubmissionPipelineService,
  ) {}

  async lookup(raw: string): Promise<SubmissionStatusAnswer> {
    const reference = raw.trim().toUpperCase();

    // No format check: a malformed reference takes the same path as an unknown
    // one and gets the same answer, so a guess learns nothing extra. A
    // submission with no `submittedAt` is still waiting on payment and has not
    // reached the department.
    const submission = await this.submissions.findByReference(reference);
    if (!submission?.submittedAt) return { kind: "not_found", reference };

    let processors: readonly { type: string; config?: unknown }[];
    try {
      // bypassVisibility: a form taken offline still has live submissions.
      const contract = await this.pipeline.resolveContract(
        submission.formId,
        true,
      );
      processors = contract.processors ?? [];
    } catch (err) {
      // A deleted recipe can't say whether the form went to CaMS; only the
      // tracker can.
      if (err instanceof NotFoundException) throw trackerNeeded();
      throw err;
    }

    if (sendsToCams(processors)) throw trackerNeeded();

    return {
      kind: "untracked",
      reference,
      receivedAt: submission.submittedAt.toISOString(),
      formId: submission.formId,
    };
  }
}

/** The tracker lookup is not wired in yet, so this is an outage, never a guess. */
function trackerNeeded(): ServiceUnavailableException {
  return new ServiceUnavailableException("Application status is unavailable");
}
