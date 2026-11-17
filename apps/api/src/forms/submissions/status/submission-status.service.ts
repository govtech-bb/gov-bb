import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FormSubmissionRepository } from "../form-submission.repository";
import { FormDefinitionsService } from "@/forms/form-definitions/form-definitions.service";
import { sendsToCams } from "../processors/webhook-mapping";
import {
  TrackerLookupClient,
  TrackerLookupError,
  type TrackerLookupResult,
} from "./tracker-lookup.client";

/**
 * The answer to "where is application <reference>?", as the chat reads it
 * (govbb-chatbot `getSubmissionStatus`). Nothing beyond these fields: no
 * applicant data, no form values, no ministry.
 */
export type SubmissionStatusAnswer =
  | {
      kind: "found";
      reference: string;
      /** The tracker's status, passed through unmapped: an unknown one is the
       * chat's to show as "We can't show this result here". */
      status: string;
      updatedAt: string;
      /** So the chat can link the service's page, as for untracked (#3624). */
      formId: string;
    }
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
  private readonly logger = new Logger(SubmissionStatusService.name);

  constructor(
    private readonly submissions: FormSubmissionRepository,
    private readonly formDefs: FormDefinitionsService,
    private readonly tracker: TrackerLookupClient,
  ) {}

  async lookup(raw: string): Promise<SubmissionStatusAnswer> {
    const reference = raw.trim().toUpperCase();

    // No format check: a malformed reference takes the same path as an unknown
    // one and gets the same answer, so a guess learns nothing extra. A
    // submission with no `submittedAt` is still waiting on payment and has not
    // reached the department.
    const submission = await this.submissions.findByReference(reference);
    if (!submission?.submittedAt) return { kind: "not_found", reference };
    const submittedAt = submission.submittedAt.toISOString();

    const untracked: SubmissionStatusAnswer = {
      kind: "untracked",
      reference,
      receivedAt: submittedAt,
      formId: submission.formId,
    };

    let recipeSendsToCams: boolean;
    try {
      // The published recipe, as the payment webhook reads it for an existing
      // submission: past the visibility gate (a form taken offline still has
      // live submissions), and not through the submit path, whose draft check
      // turns a deleted form that has a builder draft into a 400.
      const contract = await this.formDefs.findByFormId({
        formId: submission.formId,
        includeProcessors: true,
        bypassVisibility: true,
      });
      recipeSendsToCams = sendsToCams(contract.processors ?? []);
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      // The recipe has been deleted, so it can't say whether the form went to
      // CaMS. The tracker can: a record means it did.
      const tracked = await this.askTracker(reference);
      return tracked.found
        ? found(reference, submission.formId, tracked)
        : untracked;
    }

    if (!recipeSendsToCams) return untracked;

    // No record yet (before its first status event, or while that CaMS
    // deployment isn't publishing statuses): it really was received.
    const tracked = await this.askTracker(reference);
    return tracked.found
      ? found(reference, submission.formId, tracked)
      : {
          kind: "found",
          reference,
          status: "received",
          updatedAt: submittedAt,
          formId: submission.formId,
        };
  }

  /** The tracker's answer; any failure is an outage, never a guess. */
  private async askTracker(reference: string): Promise<TrackerLookupResult> {
    try {
      return await this.tracker.lookup(reference);
    } catch (err) {
      // The reason only: a reference unlocks the public tracker, so it is
      // never logged.
      const reason =
        err instanceof TrackerLookupError ? err.reason : "unexpected";
      this.logger.warn(`[status] tracker lookup failed: ${reason}`);
      throw new ServiceUnavailableException(
        "Application status is unavailable",
      );
    }
  }
}

function found(
  reference: string,
  formId: string,
  tracked: Extract<TrackerLookupResult, { found: true }>,
): SubmissionStatusAnswer {
  return {
    kind: "found",
    reference,
    status: tracked.status,
    updatedAt: tracked.occurredAt,
    formId,
  };
}
