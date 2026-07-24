import { formSubmissionResponseBodySchema } from "./form-submission.type";

const basePayload = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  createdAt: "2026-06-04T13:07:32Z",
  updatedAt: "2026-06-04T13:07:32Z",
  idempotencyKey: "idem-key-001",
  formId: "passport-renewal",
  formVersion: "1",
  status: "submitted",
  values: {},
  meta: null,
  submittedAt: "2026-06-04T13:07:32Z",
};

describe("formSubmissionResponseBodySchema", () => {
  it("parses a payload that includes referenceCode", () => {
    const result = formSubmissionResponseBodySchema.safeParse({
      ...basePayload,
      referenceCode: "JPP-20260604-130732-9JZRZC",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.referenceCode).toBe("JPP-20260604-130732-9JZRZC");
    }
  });

  it("parses a payload that omits referenceCode (older API — must not fail)", () => {
    const result = formSubmissionResponseBodySchema.safeParse(basePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.referenceCode).toBeUndefined();
    }
  });

  it("still parses the id field correctly", () => {
    const result = formSubmissionResponseBodySchema.safeParse({
      ...basePayload,
      referenceCode: "JPP-20260604-130732-9JZRZC",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(basePayload.id);
    }
  });
});
