import { YouthOpportunityWebhookListener } from "./youth-opportunity-webhook.listener";
import type { YouthOpportunityWebhookService } from "./youth-opportunity-webhook.service";
import type { SubmissionCreatedEvent } from "../forms/submissions/submissions.types";

function makeEvent(
  overrides: Partial<SubmissionCreatedEvent> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-1",
    referenceCode: "YTH-20260604-130732-000001",
    formId: "youth-opportunity-byac",
    formVersion: "1.0.0",
    idempotencyKey: "idem-1",
    processors: [],
    values: {
      "applicant-details": {
        "applicant-first-name": "Jane",
        "applicant-last-name": "Doe",
        "applicant-email": "jane@example.com",
        "applicant-phone": "246-555-1234",
      },
    },
    meta: {
      schemaVersion: 2,
      pinnedFormVersion: "1.0.0",
      draftId: null,
      activeStepIds: ["applicant-details"],
      hiddenStepIds: [],
      activeFieldIds: {},
      hiddenFieldIds: {},
      visitedPages: [0],
      submittedAt: "2026-06-03T10:00:00.000Z",
    },
    ...overrides,
  };
}

describe("YouthOpportunityWebhookListener (dormant — #841/#1458)", () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let listener: YouthOpportunityWebhookListener;

  beforeEach(() => {
    dispatch = vi.fn().mockResolvedValue(undefined);
    listener = new YouthOpportunityWebhookListener({
      dispatch,
    } as unknown as YouthOpportunityWebhookService);
  });

  // The FORM_ID_SERVICE_CODES map is drained: every programme now dispatches
  // via the `webhook` processor in its recipe (code = the submission's
  // referenceCode). This legacy listener must no longer dispatch anything —
  // otherwise migrated forms would be sent twice, with two different codes.

  it("does not dispatch a formerly-mapped youth-opportunity submission", async () => {
    await listener.handleSubmissionCreated(makeEvent());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch a non-youth-opportunity submission", async () => {
    await listener.handleSubmissionCreated(
      makeEvent({ formId: "passport-renewal" }),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch a smoke submission", async () => {
    await listener.handleSubmissionCreated(
      makeEvent({ isSmokeSubmission: true }),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
});
