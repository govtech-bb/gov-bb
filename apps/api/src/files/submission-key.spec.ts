import {
  SUBMISSION_KEY_PATTERN,
  buildSubmissionKey,
  parseSubmissionKey,
  submissionKeyPrefix,
} from "./submission-key";

describe("submission-key", () => {
  describe("buildSubmissionKey", () => {
    it("embeds the tuple and sanitises the filename", () => {
      const key = buildSubmissionKey(
        "passport-renewal",
        "documents",
        "policeCertificate",
        "My Cert!.pdf",
      );
      expect(key).toMatch(
        /^uploads\/passport-renewal\/documents\/policeCertificate\/\d{4}\/\d{2}\/[0-9a-f-]{36}-my_cert\.pdf$/,
      );
    });

    it("round-trips through parseSubmissionKey", () => {
      const key = buildSubmissionKey(
        "passport-renewal",
        "step-1",
        "fieldA",
        "x.pdf",
      );
      expect(parseSubmissionKey(key)).toEqual({
        formId: "passport-renewal",
        stepId: "step-1",
        fieldId: "fieldA",
      });
    });
  });

  describe("parseSubmissionKey", () => {
    it("returns null for a legacy (tuple-less) key", () => {
      expect(
        parseSubmissionKey(
          "uploads/passport-renewal/2026/05/abcdef01-2345-6789-abcd-ef0123456789-x.pdf",
        ),
      ).toBeNull();
    });
  });

  describe("SUBMISSION_KEY_PATTERN", () => {
    const tuple =
      "uploads/passport-renewal/documents/policeCertificate/2026/05/abcdef01-2345-6789-abcd-ef0123456789-x.pdf";
    const legacy =
      "uploads/passport-renewal/2026/05/abcdef01-2345-6789-abcd-ef0123456789-x.pdf";

    it("accepts a new-format tuple key", () => {
      expect(SUBMISSION_KEY_PATTERN.test(tuple)).toBe(true);
    });

    it("accepts a legacy tuple-less key", () => {
      expect(SUBMISSION_KEY_PATTERN.test(legacy)).toBe(true);
    });

    it("rejects forged / wrong-shaped keys", () => {
      expect(SUBMISSION_KEY_PATTERN.test("uploads/../etc/passwd")).toBe(false);
      expect(
        SUBMISSION_KEY_PATTERN.test(
          "uploads/passport-renewal/2026/05/not-a-uuid-x.pdf",
        ),
      ).toBe(false);
    });
  });

  describe("submissionKeyPrefix", () => {
    it("returns the per-form prefix", () => {
      expect(submissionKeyPrefix("passport-renewal")).toBe(
        "uploads/passport-renewal/",
      );
    });
  });
});
