import { buildWebhookFormData, extractApplicant } from "./applicant-extractor";
import type { SubmissionValues } from "../forms/submissions/submissions.types";

const standardValues: SubmissionValues = {
  "applicant-details": {
    "applicant-first-name": "Jane",
    "applicant-last-name": "Doe",
    "applicant-dob": "2005-04-01",
    "applicant-email": "jane@example.com",
    "applicant-phone": "246-555-1234",
    "applicant-parish": "St. Michael",
    "applicant-citizenship": "Barbadian",
  },
  "your-interest": { "interest-motivation": "I want to take part." },
  declaration: {
    "declaration-confirmed": true,
    "declaration-date": "2026-06-03",
  },
  "submission-confirmation": {},
};

describe("extractApplicant", () => {
  it("combines first and last name and reads email/phone", () => {
    expect(extractApplicant(standardValues)).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "246-555-1234",
    });
  });

  it("tolerates camelCase name fields and the phone-number variant", () => {
    const variant: SubmissionValues = {
      "applicant-details": {
        "applicant-firstName": "Sam",
        "applicant-lastName": "Lee",
        "applicant-email": "sam@example.com",
        "phone-number": "246-555-9999",
      },
    };
    expect(extractApplicant(variant)).toEqual({
      name: "Sam Lee",
      email: "sam@example.com",
      phone: "246-555-9999",
    });
  });

  it("returns null email/phone when absent and trims blank names", () => {
    const sparse: SubmissionValues = {
      "applicant-details": { "applicant-email": "" },
    };
    expect(extractApplicant(sparse)).toEqual({
      name: "",
      email: null,
      phone: null,
    });
  });

  it("yields empty applicant when the applicant step is array-shaped", () => {
    // The applicant step is never repeatable; an array shape is ignored, so
    // every field reads as missing.
    const arrayShaped: SubmissionValues = { "applicant-details": [] };
    expect(extractApplicant(arrayShaped)).toEqual({
      name: "",
      email: null,
      phone: null,
    });
  });
});

describe("buildWebhookFormData", () => {
  it("hoists content fields, drops process steps and applicant identity", () => {
    expect(buildWebhookFormData(standardValues)).toEqual({
      "applicant-dob": "2005-04-01",
      "applicant-parish": "St. Michael",
      "applicant-citizenship": "Barbadian",
      "interest-motivation": "I want to take part.",
    });
  });

  it("excludes every applicant-name/email/phone variant", () => {
    const flat = buildWebhookFormData({
      "applicant-details": {
        "applicant-firstName": "Sam",
        "applicant-lastName": "Lee",
        "applicant-email": "sam@example.com",
        "phone-number": "246-555-9999",
        "applicant-parish": "St. John",
      },
    });
    expect(flat).toEqual({ "applicant-parish": "St. John" });
  });

  it("passes repeatable steps through under their stepId", () => {
    const flat = buildWebhookFormData({
      "applicant-details": { "applicant-parish": "St. Lucy" },
      referees: [{ name: "A" }, { name: "B" }],
    });
    expect(flat.referees).toEqual([{ name: "A" }, { name: "B" }]);
  });
});
