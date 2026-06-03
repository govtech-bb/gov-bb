import { Logger } from "@nestjs/common";
import { YouthOpportunityWebhookListener } from "./youth-opportunity-webhook.listener";
import type { YouthOpportunityWebhookService } from "./youth-opportunity-webhook.service";
import type { SubmissionCreatedEvent } from "../forms/submissions/submissions.types";

function makeEvent(
  overrides: Partial<SubmissionCreatedEvent> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-1",
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
        "applicant-parish": "St. Michael",
      },
      "your-interest": { "interest-motivation": "Keen" },
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

describe("YouthOpportunityWebhookListener", () => {
  let dispatch: jest.Mock;
  let listener: YouthOpportunityWebhookListener;

  beforeEach(() => {
    dispatch = jest.fn().mockResolvedValue(undefined);
    listener = new YouthOpportunityWebhookListener({
      dispatch,
    } as unknown as YouthOpportunityWebhookService);
  });

  it("dispatches a mapped youth-opportunity submission with a generated code", async () => {
    await listener.handleSubmissionCreated(makeEvent());

    expect(dispatch).toHaveBeenCalledTimes(1);
    const payload = dispatch.mock.calls[0][0];
    expect(payload.programmeCode).toBe("BYAC");
    expect(payload.code).toMatch(/^BYAC-\d{4}-[0-9A-Z]{7}$/);
    expect(payload.applicantName).toBe("Jane Doe");
    expect(payload.applicantEmail).toBe("jane@example.com");
    expect(payload.applicantPhone).toBe("246-555-1234");
    expect(payload.submittedAt).toBe("2026-06-03T10:00:00.000Z");
    expect(payload.formData).toEqual({
      "applicant-parish": "St. Michael",
      "interest-motivation": "Keen",
    });
  });

  it("ignores non-youth-opportunity submissions silently", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    await listener.handleSubmissionCreated(
      makeEvent({ formId: "passport-renewal" }),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("warns but does not dispatch an unmapped youth-opportunity form", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    await listener.handleSubmissionCreated(
      makeEvent({ formId: "youth-opportunity-mystery" }),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unmapped"));
    warn.mockRestore();
  });
});
