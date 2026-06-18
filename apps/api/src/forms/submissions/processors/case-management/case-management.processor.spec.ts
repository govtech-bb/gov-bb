import { CaseManagementProcessor } from "./case-management.processor";
import type { CaseManagementWebhookService } from "./case-management-webhook.service";
import type { ISubmissionProcessor } from "../submission-processor.interface";
import type { SubmissionCreatedEvent } from "../../submissions.types";

function makePayload(
  overrides: Partial<SubmissionCreatedEvent> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-1",
    referenceCode: "CAMP-20260616-000001-ABCDEF",
    formId: "national-summer-camp",
    formVersion: "1.4.0",
    idempotencyKey: "idem-cm-1",
    // email at index 0, case-management at index 1 — mirrors the real recipes.
    processors: [
      {
        type: "email",
        config: { recipientField: "applicant-details.applicant-email" },
      },
      { type: "case-management", config: { programmeCode: "CAMP" } },
    ] as SubmissionCreatedEvent["processors"],
    processorIndex: 1,
    values: {
      "applicant-details": {
        "applicant-first-name": "Ada",
        "applicant-last-name": "Lovelace",
        "applicant-email": "ada@example.bb",
        "phone-number": "+1246555000",
      },
      "your-interest": { motivation: "Robotics" },
      declaration: { agree: true },
    },
    meta: {
      schemaVersion: 2,
      pinnedFormVersion: "1.4.0",
      draftId: "draft-1",
      activeStepIds: ["applicant-details", "your-interest"],
      hiddenStepIds: [],
      activeFieldIds: {},
      hiddenFieldIds: {},
      visitedPages: [0],
      submittedAt: "2026-06-16T09:00:00.000Z",
    } as unknown as SubmissionCreatedEvent["meta"],
    ...overrides,
  };
}

describe("CaseManagementProcessor", () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let processor: CaseManagementProcessor;

  beforeEach(() => {
    dispatch = vi.fn().mockResolvedValue(undefined);
    processor = new CaseManagementProcessor({
      dispatch,
    } as unknown as CaseManagementWebhookService);
  });

  it("dispatches the addressed entry (index 1), not index 0", async () => {
    const result = await processor.process(makePayload());

    expect(result).toEqual({ kind: "completed" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const payload = dispatch.mock.calls[0][0];
    expect(payload.programmeCode).toBe("CAMP");
  });

  it("builds the applicant + form_data + tracking code from values", async () => {
    await processor.process(makePayload());
    const payload = dispatch.mock.calls[0][0];

    expect(payload.applicantName).toBe("Ada Lovelace");
    expect(payload.applicantEmail).toBe("ada@example.bb");
    expect(payload.applicantPhone).toBe("+1246555000");
    expect(payload.submittedAt).toBe("2026-06-16T09:00:00.000Z");
    // identity fields are dropped from form_data; content steps are hoisted,
    // process steps (declaration) dropped.
    expect(payload.formData).toMatchObject({ motivation: "Robotics" });
    expect(payload.formData).not.toHaveProperty("applicant-email");
    expect(payload.formData).not.toHaveProperty("agree");
    // <SERVICE>-<DDMM>-<counter3><random4>
    expect(payload.code).toMatch(/^CAMP-\d{4}-[A-Z0-9]{7}$/);
  });

  it("throws on an unknown programmeCode (visible DLQ, no bogus POST)", async () => {
    const payload = makePayload();
    (
      payload.processors[1] as { config: { programmeCode: string } }
    ).config.programmeCode = "NOT-A-CODE";

    await expect(processor.process(payload)).rejects.toThrow(
      /Unknown programmeCode/,
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("throws when programmeCode is missing", async () => {
    const payload = makePayload();
    (payload.processors[1] as { config: Record<string, unknown> }).config = {};

    await expect(processor.process(payload)).rejects.toThrow(
      /Unknown programmeCode/,
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("is non-gating (runs on the async processor path)", () => {
    expect((processor as ISubmissionProcessor).gatesPipeline).toBeFalsy();
    expect(processor.type).toBe("case-management");
  });
});
