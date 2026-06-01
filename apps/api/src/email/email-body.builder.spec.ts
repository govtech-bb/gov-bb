import { EmailBodyBuilder } from "./email-body.builder";
import type { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import type { ServiceContract } from "@govtech-bb/form-types";
import type { SubmissionCreatedEvent } from "../forms/submissions/submissions.types";

/* ── fixtures ─────────────────────────────────────────────────────────────── */

function makeContract(
  overrides: Partial<ServiceContract> = {},
): ServiceContract {
  return {
    formId: "test-form",
    title: "Test Form",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [
      {
        stepId: "personal",
        title: "Personal Information",
        elements: [
          { fieldId: "firstName", label: "First Name", htmlType: "text" },
          { fieldId: "lastName", label: "Last Name", htmlType: "text" },
          {
            fieldId: "gender",
            label: "Gender",
            htmlType: "radio",
            options: [
              { label: "Male", value: "male" },
              { label: "Female", value: "female" },
            ],
          },
          {
            fieldId: "interests",
            label: "Interests",
            htmlType: "checkbox",
            options: [
              { label: "Sports", value: "sports" },
              { label: "Music", value: "music" },
              { label: "Art", value: "art" },
            ],
          },
          {
            fieldId: "country",
            label: "Country",
            htmlType: "select",
            multiple: false,
            options: [
              { label: "Barbados", value: "bb" },
              { label: "Trinidad", value: "tt" },
            ],
          },
          {
            fieldId: "languages",
            label: "Languages",
            htmlType: "select",
            multiple: true,
            options: [
              { label: "English", value: "en" },
              { label: "French", value: "fr" },
              { label: "Spanish", value: "es" },
            ],
          },
        ],
      },
      {
        stepId: "contact",
        title: "Contact Details",
        elements: [
          { fieldId: "email", label: "Email", htmlType: "email" },
          { fieldId: "phone", label: "Phone", htmlType: "tel" },
        ],
      },
    ],
    ...overrides,
  } as ServiceContract;
}

function makePayload(
  overrides: Partial<SubmissionCreatedEvent> = {},
): SubmissionCreatedEvent {
  return {
    submissionId: "sub-001",
    formId: "test-form",
    formVersion: "1.0.0",
    idempotencyKey: "key-1",
    processors: [],
    values: {
      personal: {
        firstName: "Alice",
        lastName: "Smith",
        gender: "female",
        interests: ["sports", "art"],
        country: "bb",
        languages: ["en", "fr"],
      },
      contact: {
        email: "alice@example.com",
        phone: "555-0100",
      },
    },
    meta: {
      schemaVersion: 1,
      pinnedFormVersion: "1.0.0",
      draftId: null,
      activeStepIds: ["personal", "contact"],
      hiddenStepIds: [],
      activeFieldIds: {
        personal: [
          "firstName",
          "lastName",
          "gender",
          "interests",
          "country",
          "languages",
        ],
        contact: ["email", "phone"],
      },
      hiddenFieldIds: {},
      visitedPages: [0, 1],
      submittedAt: "2026-05-12T10:00:00.000Z",
    },
    ...overrides,
  };
}

function makeFormDefinitionsService(
  contract: ServiceContract = makeContract(),
): jest.Mocked<FormDefinitionsService> {
  return {
    findByFormId: jest.fn().mockResolvedValue(contract),
  } as unknown as jest.Mocked<FormDefinitionsService>;
}

/* ── tests ───────────────────────────────────────────────────────────────── */

describe("EmailBodyBuilder", () => {
  let formSvc: jest.Mocked<FormDefinitionsService>;
  let builder: EmailBodyBuilder;

  beforeEach(() => {
    formSvc = makeFormDefinitionsService();
    builder = new EmailBodyBuilder(formSvc);
  });

  describe("build()", () => {
    it("populates top-level metadata from the contract and payload", async () => {
      const ctx = await builder.build(makePayload());

      expect(ctx.formTitle).toBe("Test Form");
      expect(ctx.submissionId).toBe("sub-001");
      expect(ctx.submittedAt).toBe("2026-05-12T10:00:00.000Z");
      expect(typeof ctx.processedAt).toBe("string");
    });

    it("fetches the contract using formId and formVersion from the payload", async () => {
      await builder.build(makePayload());

      expect(formSvc.findByFormId).toHaveBeenCalledWith({
        formId: "test-form",
        version: "1.0.0",
      });
    });

    it("builds one section per active, visible step", async () => {
      const ctx = await builder.build(makePayload());

      expect(ctx.sections).toHaveLength(2);
      expect(ctx.sections[0].title).toBe("Personal Information");
      expect(ctx.sections[1].title).toBe("Contact Details");
    });

    it("renders plain text field values as strings", async () => {
      const ctx = await builder.build(makePayload());

      expect(ctx.sections[0].fields).toEqual(
        expect.arrayContaining([
          { label: "First Name", value: "Alice" },
          { label: "Last Name", value: "Smith" },
        ]),
      );
    });

    it("resolves radio value to its option label", async () => {
      const ctx = await builder.build(makePayload());
      const field = ctx.sections[0].fields.find((f) => f.label === "Gender");

      expect(field?.value).toBe("Female");
    });

    it("resolves checkbox values to joined option labels", async () => {
      const ctx = await builder.build(makePayload());
      const field = ctx.sections[0].fields.find((f) => f.label === "Interests");

      expect(field?.value).toBe("Sports, Art");
    });

    it("resolves single-select value to its option label", async () => {
      const ctx = await builder.build(makePayload());
      const field = ctx.sections[0].fields.find((f) => f.label === "Country");

      expect(field?.value).toBe("Barbados");
    });

    it("resolves multi-select (select[multiple]) values to joined option labels", async () => {
      const ctx = await builder.build(makePayload());
      const field = ctx.sections[0].fields.find((f) => f.label === "Languages");

      expect(field?.value).toBe("English, French");
    });

    it("omits steps listed in hiddenStepIds", async () => {
      const payload = makePayload();
      payload.meta.hiddenStepIds = ["contact"];

      const ctx = await builder.build(payload);

      expect(ctx.sections.map((s) => s.title)).not.toContain("Contact Details");
    });

    it("omits steps absent from activeStepIds", async () => {
      const payload = makePayload();
      payload.meta.activeStepIds = ["personal"];

      const ctx = await builder.build(payload);

      expect(ctx.sections).toHaveLength(1);
    });

    it("omits fields absent from activeFieldIds when the key is present", async () => {
      const payload = makePayload();
      payload.meta.activeFieldIds["personal"] = ["firstName"];

      const ctx = await builder.build(payload);
      const labels = ctx.sections[0].fields.map((f) => f.label);

      expect(labels).toContain("First Name");
      expect(labels).not.toContain("Last Name");
    });

    it("shows all non-hidden fields when activeFieldIds key is absent for a step", async () => {
      const payload = makePayload();
      // Simulate a future form version that doesn't record per-field visibility
      delete payload.meta.activeFieldIds["contact"];

      const ctx = await builder.build(payload);
      const contactSection = ctx.sections.find(
        (s) => s.title === "Contact Details",
      );

      expect(contactSection?.fields.map((f) => f.label)).toEqual(
        expect.arrayContaining(["Email", "Phone"]),
      );
    });

    it("omits fields listed in hiddenFieldIds", async () => {
      const payload = makePayload();
      payload.meta.hiddenFieldIds = { personal: ["lastName"] };

      const ctx = await builder.build(payload);
      const labels = ctx.sections[0].fields.map((f) => f.label);

      expect(labels).not.toContain("Last Name");
    });

    it("omits file and show-hide fields entirely", async () => {
      const contract = makeContract();
      contract.steps[0].elements.push(
        { fieldId: "cv", label: "CV", htmlType: "file", multiple: false },
        { fieldId: "note", label: "Note", htmlType: "show-hide" },
      );
      formSvc = makeFormDefinitionsService(contract);
      builder = new EmailBodyBuilder(formSvc);

      const payload = makePayload();
      payload.meta.activeFieldIds["personal"] = [
        "firstName",
        "lastName",
        "gender",
        "interests",
        "country",
        "languages",
        "cv",
        "note",
      ];

      const ctx = await builder.build(payload);
      const labels = ctx.sections[0].fields.map((f) => f.label);

      expect(labels).not.toContain("CV");
      expect(labels).not.toContain("Note");
    });

    it("omits sections whose every field resolved to empty", async () => {
      const payload = makePayload();
      payload.values["contact"] = { email: "", phone: "" };

      const ctx = await builder.build(payload);

      expect(ctx.sections.map((s) => s.title)).not.toContain("Contact Details");
    });

    it("falls back to raw value when option label is not found", async () => {
      const payload = makePayload();
      payload.values["personal"] = {
        ...payload.values["personal"],
        gender: "other", // not in options list
      };

      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find((f) => f.label === "Gender");

      expect(field?.value).toBe("other");
    });
  });

  describe("repeatable step handling (V2 submission values)", () => {
    function makeRepeatableContract(): ServiceContract {
      return makeContract({
        steps: [
          {
            stepId: "directors",
            title: "Director",
            repeatable: true,
            elements: [
              { fieldId: "name", label: "Full Name", htmlType: "text" },
              { fieldId: "role", label: "Role", htmlType: "text" },
            ],
          } as unknown as ServiceContract["steps"][number],
        ],
      });
    }

    it("emits one section per repeatable instance when values is an array", async () => {
      formSvc = makeFormDefinitionsService(makeRepeatableContract());
      builder = new EmailBodyBuilder(formSvc);

      const payload = makePayload({
        values: {
          directors: [
            { name: "Alice", role: "CEO" },
            { name: "Bob", role: "CFO" },
          ] as unknown as Record<string, unknown>,
        },
        meta: {
          schemaVersion: 1,
          pinnedFormVersion: "1.0.0",
          draftId: null,
          activeStepIds: ["directors"],
          hiddenStepIds: [],
          activeFieldIds: { directors: ["name", "role"] },
          hiddenFieldIds: {},
          visitedPages: [0],
          submittedAt: "2026-05-12T10:00:00.000Z",
        },
      });

      const ctx = await builder.build(payload);

      expect(ctx.sections).toHaveLength(2);
      expect(ctx.sections[0].title).toBe("Director (1)");
      expect(ctx.sections[1].title).toBe("Director (2)");
      expect(ctx.sections[0].fields).toEqual([
        { label: "Full Name", value: "Alice" },
        { label: "Role", value: "CEO" },
      ]);
      expect(ctx.sections[1].fields).toEqual([
        { label: "Full Name", value: "Bob" },
        { label: "Role", value: "CFO" },
      ]);
    });

    it("omits the instance index when there is only one repeatable instance", async () => {
      formSvc = makeFormDefinitionsService(makeRepeatableContract());
      builder = new EmailBodyBuilder(formSvc);

      const payload = makePayload({
        values: {
          directors: [{ name: "Alice", role: "CEO" }] as unknown as Record<
            string,
            unknown
          >,
        },
        meta: {
          schemaVersion: 1,
          pinnedFormVersion: "1.0.0",
          draftId: null,
          activeStepIds: ["directors"],
          hiddenStepIds: [],
          activeFieldIds: { directors: ["name", "role"] },
          hiddenFieldIds: {},
          visitedPages: [0],
          submittedAt: "2026-05-12T10:00:00.000Z",
        },
      });

      const ctx = await builder.build(payload);

      expect(ctx.sections).toHaveLength(1);
      expect(ctx.sections[0].title).toBe("Director");
    });

    it("skips repeatable instances whose every field is empty", async () => {
      formSvc = makeFormDefinitionsService(makeRepeatableContract());
      builder = new EmailBodyBuilder(formSvc);

      const payload = makePayload({
        values: {
          directors: [
            { name: "Alice", role: "CEO" },
            { name: "", role: "" }, // empty instance
          ] as unknown as Record<string, unknown>,
        },
        meta: {
          schemaVersion: 1,
          pinnedFormVersion: "1.0.0",
          draftId: null,
          activeStepIds: ["directors"],
          hiddenStepIds: [],
          activeFieldIds: { directors: ["name", "role"] },
          hiddenFieldIds: {},
          visitedPages: [0],
          submittedAt: "2026-05-12T10:00:00.000Z",
        },
      });

      const ctx = await builder.build(payload);

      // Only the non-empty instance should appear; index is still applied
      // because the raw array had length > 1
      expect(ctx.sections).toHaveLength(1);
      expect(ctx.sections[0].title).toBe("Director (1)");
    });
  });

  describe("V2 audit trail activeFieldIds (string[][])", () => {
    // Helper that builds a payload with V2-style nested arrays injected via
    // unknown so TypeScript does not widen the type of `meta` used in other tests.
    function makeV2Payload(
      activeOverride: Record<string, unknown>,
      hiddenOverride: Record<string, unknown> = {},
    ): SubmissionCreatedEvent {
      return {
        ...makePayload(),
        meta: {
          ...makePayload().meta,
          activeFieldIds: activeOverride as unknown as Record<string, string[]>,
          hiddenFieldIds: hiddenOverride as unknown as Record<string, string[]>,
        },
      };
    }

    it("flattens string[][] activeFieldIds and filters fields correctly", async () => {
      // Simulate V2 per-instance activeFieldIds where different instances expose
      // different fields — the union should be shown in the email.
      const payload = makeV2Payload({
        personal: [
          ["firstName", "gender"],
          ["firstName", "lastName"],
        ],
        contact: ["email", "phone"],
      });

      const ctx = await builder.build(payload);
      const labels = ctx.sections[0].fields.map((f) => f.label);

      // Union across both instances: firstName ∪ gender ∪ lastName
      expect(labels).toContain("First Name");
      expect(labels).toContain("Last Name");
      expect(labels).toContain("Gender");
      // country/languages/interests not in any instance's activeFieldIds
      expect(labels).not.toContain("Country");
      expect(labels).not.toContain("Languages");
    });

    it("flattens string[][] hiddenFieldIds and hides fields correctly", async () => {
      const payload = makeV2Payload(
        {
          personal: [
            "firstName",
            "lastName",
            "gender",
            "interests",
            "country",
            "languages",
          ],
          contact: ["email", "phone"],
        },
        { personal: [["lastName"], ["lastName"]] },
      );

      const ctx = await builder.build(payload);
      const labels = ctx.sections[0].fields.map((f) => f.label);

      expect(labels).not.toContain("Last Name");
      expect(labels).toContain("First Name");
    });
  });

  describe("contract caching", () => {
    it("fetches the contract only once for the same formId + version", async () => {
      const payload = makePayload();

      await builder.build(payload);
      await builder.build(payload);
      await builder.build(payload);

      expect(formSvc.findByFormId).toHaveBeenCalledTimes(1);
    });

    it("fetches separately for different form versions", async () => {
      const payloadV1 = makePayload();
      const payloadV2 = makePayload();
      payloadV2.formVersion = "2.0.0";

      await builder.build(payloadV1);
      await builder.build(payloadV2);

      expect(formSvc.findByFormId).toHaveBeenCalledTimes(2);
      expect(formSvc.findByFormId).toHaveBeenCalledWith(
        expect.objectContaining({ version: "1.0.0" }),
      );
      expect(formSvc.findByFormId).toHaveBeenCalledWith(
        expect.objectContaining({ version: "2.0.0" }),
      );
    });
  });

  describe("resolveContactDetails()", () => {
    it("returns the contract's contactDetails when present", async () => {
      const contactDetails = {
        title: "Passport Office",
        telephoneNumber: "+1-246-555-0100",
        email: "mda@gov.bb",
      };
      formSvc = makeFormDefinitionsService(makeContract({ contactDetails }));
      builder = new EmailBodyBuilder(formSvc);

      const result = await builder.resolveContactDetails(makePayload());

      expect(result).toEqual(contactDetails);
    });

    it("returns undefined when the contract has no contactDetails", async () => {
      const result = await builder.resolveContactDetails(makePayload());

      expect(result).toBeUndefined();
    });

    it("reuses the cached contract — does not double-fetch alongside build()", async () => {
      const payload = makePayload();

      await builder.build(payload);
      await builder.resolveContactDetails(payload);

      expect(formSvc.findByFormId).toHaveBeenCalledTimes(1);
    });
  });

  describe("missing branch coverage", () => {
    it("handles null rawVal for an active step (line 114 ?? {} branch)", async () => {
      // Step is in activeStepIds but values[stepId] is undefined → rawVal ?? {} = {}
      const payload = makePayload();
      // Remove 'contact' from values so rawVal is undefined, but keep it active
      delete (payload.values as Record<string, unknown>)["contact"];
      const ctx = await builder.build(payload);
      // contact section should be omitted (empty fields from empty {}), no crash
      const titles = ctx.sections.map((s) => s.title);
      expect(titles).not.toContain("Contact Details");
    });

    it("uses fallback string when select[multiple] option label is not found", async () => {
      // Branch in resolveOptionLabels: ??.label ?? String(v) for a missing option
      const payload = makePayload();
      (payload.values["personal"] as Record<string, unknown>)["languages"] = [
        "unknown-code",
      ];
      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find((f) => f.label === "Languages");
      expect(field?.value).toBe("unknown-code");
    });

    it("uses fallback string when checkbox option label is not found", async () => {
      // Branch in resolveOptionLabels: missing option label → String(v)
      const payload = makePayload();
      (payload.values["personal"] as Record<string, unknown>)["interests"] = [
        "unknown-interest",
      ];
      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find((f) => f.label === "Interests");
      expect(field?.value).toBe("unknown-interest");
    });

    it("formats checkbox with a scalar (non-array) value via [raw] coercion", async () => {
      // Branch: `Array.isArray(raw) ? raw : [raw]` — the [raw] arm for checkbox
      const payload = makePayload();
      (payload.values["personal"] as Record<string, unknown>)["interests"] =
        "sports" as unknown as string[];
      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find((f) => f.label === "Interests");
      expect(field?.value).toBe("Sports");
    });

    it("handles select[multiple]=true with scalar value (falls through to single-select path)", async () => {
      // Branch: `field.multiple && Array.isArray(raw)` is false when raw is scalar
      const payload = makePayload();
      (payload.values["personal"] as Record<string, unknown>)["languages"] =
        "en" as unknown as string[];
      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find((f) => f.label === "Languages");
      // Falls through to single-select: finds option label "English"
      expect(field?.value).toBe("English");
    });
  });
});
