import { buildMappedCasePayload, readPath } from "./webhook-mapping";
import type { WebhookMapping } from "@govtech-bb/form-types";
import type { SubmissionValues } from "../submissions.types";

const VALUES: SubmissionValues = {
  "child-details": {
    "child-first-name": "Ada",
    "child-last-name": "Lovelace",
    "child-dob": "2015-01-01",
  },
  "contact-details": {
    "parent-email": "parent@example.bb",
    "parent-mobile-phone": "421-1234",
  },
  "your-interest": { motivation: "Robots" },
  declaration: { "declaration-confirmed": "confirmed" },
};

const MAPPING: WebhookMapping = {
  programmeCode: "SCIENCE2026",
  applicant: {
    name: ["child-details.child-first-name", "child-details.child-last-name"],
    email: "contact-details.parent-email",
    phone: "contact-details.parent-mobile-phone",
  },
  excludeSteps: ["declaration"],
  groupByStep: false,
};

describe("webhook-mapping", () => {
  describe("readPath", () => {
    it("reads a stepId.fieldId path, trimming, null when absent/blank", () => {
      expect(readPath(VALUES, "contact-details.parent-email")).toBe(
        "parent@example.bb",
      );
      expect(readPath(VALUES, "contact-details.missing")).toBeNull();
      expect(readPath(VALUES, "no-dot")).toBeNull();
    });

    it("returns null for a missing step or a repeatable (array) step", () => {
      expect(readPath(VALUES, "no-such-step.field")).toBeNull();
      expect(readPath({ rep: [{ a: "1" }] } as never, "rep.a")).toBeNull();
    });
  });

  describe("buildMappedCasePayload — variants", () => {
    it("accepts a single-string name path", () => {
      const p = buildMappedCasePayload({
        mapping: {
          programmeCode: "X",
          applicant: {
            name: "child-details.child-first-name",
            email: "contact-details.parent-email",
            phone: "contact-details.parent-mobile-phone",
          },
          excludeSteps: [],
          groupByStep: false,
        },
        values: VALUES,
        referenceCode: "X-1",
        submissionId: "sub-x1",
        submittedAt: "2026-06-18T09:00:00.000Z",
      });
      expect(p.applicant.name).toBe("Ada");
    });

    it("passes repeatable (array) steps through under their stepId", () => {
      const p = buildMappedCasePayload({
        mapping: MAPPING,
        values: {
          ...VALUES,
          "collection-persons": [{ "collection-person-first-name": "Bob" }],
        },
        referenceCode: "X-2",
        submissionId: "sub-x2",
        submittedAt: "2026-06-18T09:00:00.000Z",
      });
      expect(p.form_data["collection-persons"]).toEqual([
        { "collection-person-first-name": "Bob" },
      ]);
    });
  });

  describe("buildMappedCasePayload", () => {
    const payload = buildMappedCasePayload({
      mapping: MAPPING,
      values: VALUES,
      referenceCode: "SCIENCE2026-2606-Y5RPJEP",
      submissionId: "sub-200",
      submittedAt: "2026-06-18T09:00:00.000Z",
    });

    it("uses the submission referenceCode as the code (not a minted one)", () => {
      expect(payload.code).toBe("SCIENCE2026-2606-Y5RPJEP");
      expect(payload.programme_code).toBe("SCIENCE2026");
      expect(payload.submitted_at).toBe("2026-06-18T09:00:00.000Z");
    });

    it("joins the name paths and reads email/phone from config", () => {
      expect(payload.applicant).toEqual({
        name: "Ada Lovelace",
        email: "parent@example.bb",
        phone: "421-1234",
      });
    });

    it("flattens form_data: excludes process steps + the mapped applicant fields", () => {
      // content fields hoisted...
      expect(payload.form_data).toMatchObject({
        "child-dob": "2015-01-01",
        motivation: "Robots",
      });
      // excluded step dropped...
      expect(payload.form_data).not.toHaveProperty("declaration-confirmed");
      // applicant fields already surfaced under `applicant` are dropped...
      expect(payload.form_data).not.toHaveProperty("child-first-name");
      expect(payload.form_data).not.toHaveProperty("parent-email");
      expect(payload.form_data).not.toHaveProperty("parent-mobile-phone");
    });
  });

  describe("buildMappedCasePayload — groupByStep", () => {
    const payload = buildMappedCasePayload({
      mapping: { ...MAPPING, groupByStep: true },
      values: {
        ...VALUES,
        "collection-persons": [{ "collection-person-first-name": "Bob" }],
      },
      referenceCode: "SCIENCE2026-2606-Y5RPJEP",
      submissionId: "sub-200",
      submittedAt: "2026-06-18T09:00:00.000Z",
    });

    it("nests content fields under their step id instead of hoisting", () => {
      expect(payload.form_data).toMatchObject({
        "child-details": { "child-dob": "2015-01-01" },
        "your-interest": { motivation: "Robots" },
      });
      // not hoisted to the top level
      expect(payload.form_data).not.toHaveProperty("child-dob");
      expect(payload.form_data).not.toHaveProperty("motivation");
    });

    it("still drops excluded steps and applicant fields, omitting empty groups", () => {
      expect(payload.form_data).not.toHaveProperty("declaration");
      // contact-details only held applicant email/phone → group is empty → omitted
      expect(payload.form_data).not.toHaveProperty("contact-details");
      // applicant name fields removed from their step group
      expect(payload.form_data["child-details"]).not.toHaveProperty(
        "child-first-name",
      );
    });

    it("passes repeatable steps through under their stepId unchanged", () => {
      expect(payload.form_data["collection-persons"]).toEqual([
        { "collection-person-first-name": "Bob" },
      ]);
    });
  });

  describe("buildMappedCasePayload — codeService", () => {
    const base = {
      values: VALUES,
      referenceCode: "REF-123",
      submissionId: "sub-abc",
      submittedAt: "2026-06-18T09:00:00.000Z",
    };

    it("mints a deterministic service-prefixed code when codeService is a known service", () => {
      const p = buildMappedCasePayload({
        ...base,
        mapping: { ...MAPPING, codeService: "BYAC" },
      });
      expect(p.code).toMatch(/^BYAC-\d{4}-[0-9A-Z]{7}$/);
      // deterministic — same submission → same code
      const again = buildMappedCasePayload({
        ...base,
        mapping: { ...MAPPING, codeService: "BYAC" },
      });
      expect(again.code).toBe(p.code);
    });

    it("falls back to the reference code when codeService is absent", () => {
      const p = buildMappedCasePayload({ ...base, mapping: MAPPING });
      expect(p.code).toBe("REF-123");
    });

    it("throws (fail loud) when codeService is not a known service", () => {
      expect(() =>
        buildMappedCasePayload({
          ...base,
          mapping: { ...MAPPING, codeService: "NOPE" },
        }),
      ).toThrow(/not a known service code/);
    });
  });
});
