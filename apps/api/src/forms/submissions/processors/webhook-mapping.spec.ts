import { buildMappedCasePayload, readPath } from "./webhook-mapping";
import type { ServiceContract, WebhookMapping } from "@govtech-bb/form-types";
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

    // A fieldArray answer is a string array (#2317). An applicant path is also
    // dropped from form_data, so returning null here would lose the answer
    // outright — the food business licence's "add another telephone number"
    // field is exactly that shape.
    it("joins a fieldArray answer, null when every entry is blank", () => {
      const values = {
        "about-you": { "your-telephone": ["421-1234", "  ", "230-9876"] },
        blank: { "your-telephone": ["", "  "] },
      } as unknown as SubmissionValues;
      expect(readPath(values, "about-you.your-telephone")).toBe(
        "421-1234, 230-9876",
      );
      expect(readPath(values, "blank.your-telephone")).toBeNull();
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

  describe("buildMappedCasePayload — option value→label resolution (#842)", () => {
    const OPTION_VALUES: SubmissionValues = {
      "child-details": { parish: "christ-church", "child-dob": "2015-01-01" },
      "your-interest": { topics: ["robotics", "space"] },
      "collection-persons": [{ relationship: "guardian" }],
    };

    const OPTION_MAPPING: WebhookMapping = {
      programmeCode: "X",
      applicant: { name: "a.b", email: "a.c", phone: "a.d" },
      excludeSteps: [],
      groupByStep: false,
    };

    const CONTRACT = {
      steps: [
        {
          stepId: "child-details",
          elements: [
            {
              fieldId: "parish",
              htmlType: "radio",
              options: [
                { label: "Christ Church", value: "christ-church" },
                { label: "St. Michael", value: "st-michael" },
              ],
            },
            { fieldId: "child-dob", htmlType: "date" },
          ],
        },
        {
          stepId: "your-interest",
          elements: [
            {
              fieldId: "topics",
              htmlType: "checkbox",
              options: [
                { label: "Robotics", value: "robotics" },
                { label: "Space", value: "space" },
              ],
            },
          ],
        },
        {
          stepId: "collection-persons",
          elements: [
            {
              fieldId: "relationship",
              htmlType: "radio",
              options: [
                { label: "Parent", value: "parent" },
                { label: "Guardian", value: "guardian" },
              ],
            },
          ],
        },
      ],
    } as unknown as ServiceContract;

    it("resolves option value-slugs to display labels when a contract is given", () => {
      const p = buildMappedCasePayload({
        mapping: OPTION_MAPPING,
        values: OPTION_VALUES,
        referenceCode: "R",
        submittedAt: "2026-07-28T00:00:00Z",
        contract: CONTRACT,
      });
      // radio → label; checkbox → array of labels; non-option field stays raw
      expect(p.form_data).toMatchObject({
        parish: "Christ Church",
        topics: ["Robotics", "Space"],
        "child-dob": "2015-01-01",
      });
      // repeatable step instances resolve too
      expect(p.form_data["collection-persons"]).toEqual([
        { relationship: "Guardian" },
      ]);
    });

    it("passes raw value-slugs through when no contract is given (back-compat)", () => {
      const p = buildMappedCasePayload({
        mapping: OPTION_MAPPING,
        values: OPTION_VALUES,
        referenceCode: "R",
        submittedAt: "2026-07-28T00:00:00Z",
      });
      expect(p.form_data).toMatchObject({
        parish: "christ-church",
        topics: ["robotics", "space"],
      });
      expect(p.form_data["collection-persons"]).toEqual([
        { relationship: "guardian" },
      ]);
    });
  });

  describe("buildMappedCasePayload — programmeCodeOverride", () => {
    it("uses programmeCodeOverride when provided", () => {
      const payload = buildMappedCasePayload({
        mapping: {
          programmeCode: "STATIC",
          applicant: { name: "a.b", email: "a.c", phone: "a.d" },
          excludeSteps: [],
          groupByStep: false,
        },
        values: {},
        referenceCode: "R",
        submittedAt: "2026-07-28T00:00:00Z",
        programmeCodeOverride: "TEMP_RESTAURANT_PERMIT_WINSTON_SCOTT",
      });
      expect(payload.programme_code).toBe(
        "TEMP_RESTAURANT_PERMIT_WINSTON_SCOTT",
      );
    });

    it("falls back to the static programmeCode when no override", () => {
      const payload = buildMappedCasePayload({
        mapping: {
          programmeCode: "STATIC",
          applicant: { name: "a.b", email: "a.c", phone: "a.d" },
          excludeSteps: [],
          groupByStep: false,
        },
        values: {},
        referenceCode: "R",
        submittedAt: "2026-07-28T00:00:00Z",
      });
      expect(payload.programme_code).toBe("STATIC");
    });
  });
});
