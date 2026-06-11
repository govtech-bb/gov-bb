import { EmailBodyBuilder, type EmailField } from "./email-body.builder";
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
          { fieldId: "dob", label: "Date of birth", htmlType: "date" },
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
    referenceCode: "TST-20260604-130732-ABCDEF",
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
        dob: { day: 5, month: 6, year: 1990 },
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
          "dob",
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
      // submissionId in the template context is the referenceCode when present
      expect(ctx.submissionId).toBe("TST-20260604-130732-ABCDEF");
      expect(ctx.submittedAt).toBe("2026-05-12T10:00:00.000Z");
      expect(typeof ctx.processedAt).toBe("string");
    });

    it("uses referenceCode as the template submissionId when present", async () => {
      const ctx = await builder.build(
        makePayload({ referenceCode: "JPP-20260604-130732-9JZRZC" }),
      );
      expect(ctx.submissionId).toBe("JPP-20260604-130732-9JZRZC");
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

    describe("conditionalTitle (#871)", () => {
      // A "personal" step whose heading flips to "Your details" when the
      // contact step's `applyingFor` answer is "self", else "Their details".
      const contractWithConditionalTitle = makeContract({
        steps: [
          {
            stepId: "personal",
            title: "Their details",
            conditionalTitle: [
              {
                targetStepId: "contact",
                targetFieldId: "applyingFor",
                operator: "equal",
                value: "self",
                title: "Your details",
              },
            ],
            elements: [
              { fieldId: "firstName", label: "First Name", htmlType: "text" },
            ],
          },
          {
            stepId: "contact",
            title: "Contact Details",
            elements: [{ fieldId: "email", label: "Email", htmlType: "email" }],
          },
        ],
      } as Partial<ServiceContract>);

      const payloadFor = (applyingFor: string) =>
        makePayload({
          values: {
            personal: { firstName: "Alice" },
            contact: { email: "a@example.com", applyingFor },
          },
          meta: {
            ...makePayload().meta,
            activeStepIds: ["personal", "contact"],
            activeFieldIds: {
              personal: ["firstName"],
              contact: ["email"],
            },
          },
        });

      it("uses the conditional title when its condition matches", async () => {
        builder = new EmailBodyBuilder(
          makeFormDefinitionsService(contractWithConditionalTitle),
        );
        const ctx = await builder.build(payloadFor("self"));
        expect(ctx.sections[0].title).toBe("Your details");
      });

      it("falls back to the static title when no condition matches", async () => {
        builder = new EmailBodyBuilder(
          makeFormDefinitionsService(contractWithConditionalTitle),
        );
        const ctx = await builder.build(payloadFor("someone-else"));
        expect(ctx.sections[0].title).toBe("Their details");
      });
    });

    describe("suppressed ceremony steps (feedback declaration)", () => {
      // A rating step + the form-builder's required declaration step, whose
      // confirmation checkbox the chat auto-confirms on the user's behalf.
      const withDeclaration = (formId: string): ServiceContract =>
        ({
          formId,
          title: "Give feedback on the assistant",
          version: "1.5.0",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          steps: [
            {
              stepId: "your-feedback",
              title: "Your feedback",
              elements: [
                {
                  fieldId: "experience-rating",
                  label: "Rating",
                  htmlType: "text",
                },
              ],
            },
            {
              stepId: "declaration",
              title: "Declaration",
              elements: [
                {
                  fieldId: "declaration-confirmed",
                  label: "Declaration",
                  htmlType: "checkbox",
                  options: [{ label: "I confirm", value: "confirmed" }],
                },
              ],
            },
          ],
        }) as ServiceContract;

      const declarationPayload = (formId: string) =>
        makePayload({
          formId,
          values: {
            "your-feedback": { "experience-rating": "Good" },
            declaration: { "declaration-confirmed": ["confirmed"] },
          },
          meta: {
            ...makePayload().meta,
            activeStepIds: ["your-feedback", "declaration"],
            activeFieldIds: {
              "your-feedback": ["experience-rating"],
              declaration: ["declaration-confirmed"],
            },
          },
        });

      it("omits the declaration section from the feedback email", async () => {
        builder = new EmailBodyBuilder(
          makeFormDefinitionsService(withDeclaration("chat-feedback")),
        );
        const ctx = await builder.build(declarationPayload("chat-feedback"));

        expect(ctx.sections.map((s) => s.title)).toEqual(["Your feedback"]);
        expect(ctx.sections.some((s) => s.title === "Declaration")).toBe(false);
      });

      it("keeps the declaration section for a real form (audit record)", async () => {
        builder = new EmailBodyBuilder(
          makeFormDefinitionsService(withDeclaration("get-birth-certificate")),
        );
        const ctx = await builder.build(
          declarationPayload("get-birth-certificate"),
        );

        expect(ctx.sections.some((s) => s.title === "Declaration")).toBe(true);
      });
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

    it("formats object-shaped date values instead of '[object Object]'", async () => {
      const ctx = await builder.build(makePayload());
      const field = ctx.sections[0].fields.find(
        (f) => f.label === "Date of birth",
      );

      expect(field?.value).toBe("5 June 1990");
    });

    it("formats string-part date values (forms migration tolerance, #815)", async () => {
      // Once the forms frontend flips to string date parts, submissions arrive
      // as { day: "5", month: "6", year: "1990" }. The validation boundary
      // tolerates both shapes (ADR 0043), so the email renders the same.
      const payload = makePayload();
      (payload.values.personal as Record<string, unknown>).dob = {
        day: "5",
        month: "6",
        year: "1990",
      };

      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find(
        (f) => f.label === "Date of birth",
      );

      expect(field?.value).toBe("5 June 1990");
    });

    it("passes through legacy string date values unchanged", async () => {
      const payload = makePayload();
      (payload.values.personal as Record<string, unknown>).dob = "1990-06-05";

      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find(
        (f) => f.label === "Date of birth",
      );

      expect(field?.value).toBe("1990-06-05");
    });

    it("omits a malformed object-shaped date instead of stringifying it", async () => {
      const payload = makePayload();
      (payload.values.personal as Record<string, unknown>).dob = { day: 5 };

      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find(
        (f) => f.label === "Date of birth",
      );

      expect(field).toBeUndefined();
    });

    it("omits an empty date field", async () => {
      const payload = makePayload();
      (payload.values.personal as Record<string, unknown>).dob = undefined;

      const ctx = await builder.build(payload);
      const field = ctx.sections[0].fields.find(
        (f) => f.label === "Date of birth",
      );

      expect(field).toBeUndefined();
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

    it("omits show-hide fields entirely", async () => {
      const contract = makeContract();
      contract.steps[0].elements.push({
        fieldId: "note",
        label: "Note",
        htmlType: "show-hide",
      });
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
        "note",
      ];

      const ctx = await builder.build(payload);
      const labels = ctx.sections[0].fields.map((f) => f.label);

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

  describe("file field rendering", () => {
    /** Contract whose personal step also carries a file-upload field. */
    function makeFileContract(): ServiceContract {
      const contract = makeContract();
      contract.steps[0].elements.push({
        fieldId: "policeCert",
        label: "Upload a Police Certificate of Character",
        htmlType: "file",
        multiple: false,
      });
      return contract;
    }

    /** Payload with the file field active and `items` as its stored answer. */
    function makeFilePayload(items: unknown): SubmissionCreatedEvent {
      const payload = makePayload();
      payload.meta.activeFieldIds["personal"] = [
        "firstName",
        "lastName",
        "gender",
        "interests",
        "country",
        "languages",
        "dob",
        "policeCert",
      ];
      (payload.values.personal as Record<string, unknown>).policeCert = items;
      return payload;
    }

    function fileField(ctx: { sections: Array<{ fields: EmailField[] }> }) {
      return ctx.sections[0].fields.find(
        (f) => f.label === "Upload a Police Certificate of Character",
      );
    }

    beforeEach(() => {
      formSvc = makeFormDefinitionsService(makeFileContract());
      builder = new EmailBodyBuilder(formSvc);
    });

    it("renders an uploaded file's filename", async () => {
      const ctx = await builder.build(
        makeFilePayload([
          {
            key: "uploads/abc/police-certificate.pdf",
            name: "police-certificate.pdf",
            size: 12345,
            type: "application/pdf",
          },
        ]),
      );

      expect(fileField(ctx)?.value).toBe("police-certificate.pdf");
    });

    it("joins multiple uploaded filenames with ', '", async () => {
      const ctx = await builder.build(
        makeFilePayload([
          { key: "uploads/abc/first.pdf", name: "first.pdf" },
          { key: "uploads/abc/second.pdf", name: "second.pdf" },
        ]),
      );

      expect(fileField(ctx)?.value).toBe("first.pdf, second.pdf");
    });

    it("falls back to the key's basename when name is missing or empty", async () => {
      const ctx = await builder.build(
        makeFilePayload([
          { key: "uploads/abc/from-key.pdf" },
          { key: "uploads/abc/also-from-key.pdf", name: "" },
        ]),
      );

      expect(fileField(ctx)?.value).toBe("from-key.pdf, also-from-key.pdf");
    });

    it("skips items without a non-empty string key", async () => {
      const ctx = await builder.build(
        makeFilePayload([
          { name: "never-uploaded.pdf" },
          { key: "", name: "empty-key.pdf" },
          { key: "uploads/abc/durable.pdf", name: "durable.pdf" },
        ]),
      );

      expect(fileField(ctx)?.value).toBe("durable.pdf");
    });

    it("ignores null and non-object items in the stored array", async () => {
      const ctx = await builder.build(
        makeFilePayload([
          null,
          42,
          "stray-string",
          { key: "uploads/abc/ok.pdf", name: "ok.pdf" },
        ]),
      );

      expect(fileField(ctx)?.value).toBe("ok.pdf");
    });

    it("omits the row when no item has a durable key", async () => {
      const ctx = await builder.build(
        makeFilePayload([{ name: "never-uploaded.pdf" }, { key: "" }]),
      );

      expect(fileField(ctx)).toBeUndefined();
    });

    it("omits the row when the stored answer is an empty array", async () => {
      const ctx = await builder.build(makeFilePayload([]));

      expect(fileField(ctx)).toBeUndefined();
    });

    it("omits the row for a non-array stored answer", async () => {
      const ctx = await builder.build(makeFilePayload("not-an-array"));

      expect(fileField(ctx)).toBeUndefined();
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
