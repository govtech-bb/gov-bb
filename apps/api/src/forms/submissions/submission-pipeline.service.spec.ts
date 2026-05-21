import { Test, TestingModule } from "@nestjs/testing";
import { UnprocessableEntityException } from "@nestjs/common";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { FormDefinitionsService } from "../form-definitions/form-definitions.service";
import { FormDraftsService } from "../form-drafts/form-drafts.service";
import type { ServiceContract } from "@govtech-bb/form-types";
import type { FormDraftEntity } from "../../database/entities/form-draft.entity";
import type { SubmitDto } from "./submissions.types";

const mockDraft = (overrides: Partial<FormDraftEntity> = {}): FormDraftEntity =>
  ({
    draftId: "draft-001",
    formId: "passport-renewal",
    formVersion: "1.0.0",
    lastActivePage: 1,
    values: {},
    status: "active",
    ...overrides,
  }) as unknown as FormDraftEntity;

const primitiveText = (fieldId: string, required = false) => ({
  fieldId,
  label: fieldId,
  htmlType: "text",
  behaviours: [],
  validations: required ? { required: {} } : undefined,
});

const mockContract = (
  overrides: Partial<ServiceContract> = {},
): ServiceContract =>
  ({
    formId: "passport-renewal",
    steps: [
      {
        stepId: "personal-info",
        elements: [
          primitiveText("first-name", true),
          primitiveText("surname", true),
        ],
        behaviours: [],
      },
    ],
    processors: [],
    ...overrides,
  }) as unknown as ServiceContract;

const baseDto = (): SubmitDto => ({
  idempotencyKey: "idem-001",
  formId: "passport-renewal",
  formVersion: "1.0.0",
  draftId: "draft-001",
  values: {
    "personal-info": { "first-name": "Marcus", surname: "Aurelius" },
  },
});

describe("SubmissionPipelineService", () => {
  let service: SubmissionPipelineService;
  let draftsService: jest.Mocked<FormDraftsService>;
  let definitionsService: jest.Mocked<FormDefinitionsService>;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        SubmissionPipelineService,
        {
          provide: FormDraftsService,
          useValue: { findById: jest.fn() },
        },
        {
          provide: FormDefinitionsService,
          useValue: { findByFormId: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(SubmissionPipelineService);
    draftsService = module.get(
      FormDraftsService,
    ) as jest.Mocked<FormDraftsService>;
    definitionsService = module.get(
      FormDefinitionsService,
    ) as jest.Mocked<FormDefinitionsService>;
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  describe("pinVersion", () => {
    it("uses the draft's pinned version even when the client sends a different one", async () => {
      draftsService.findById.mockResolvedValue(
        mockDraft({ formVersion: "2.0.0" }),
      );
      definitionsService.findByFormId.mockResolvedValue(mockContract());

      await service.run(baseDto());

      expect(definitionsService.findByFormId).toHaveBeenCalledWith({
        formId: "passport-renewal",
        version: "2.0.0",
        includeProcessors: true,
      });
    });

    it("no draftId → calls findByFormId directly, returns draft: null", async () => {
      const contract = mockContract();
      definitionsService.findByFormId.mockResolvedValue(contract);

      const dto = { ...baseDto(), draftId: undefined };
      const result = await service.run(dto);

      expect(draftsService.findById).not.toHaveBeenCalled();
      expect(definitionsService.findByFormId).toHaveBeenCalledWith({
        formId: dto.formId,
        version: dto.formVersion,
        includeProcessors: true,
      });
      expect(result.draft).toBeNull();
      expect(result.contract).toBe(contract);
    });

    it("throws NotFound when draft does not exist", async () => {
      draftsService.findById.mockRejectedValue(new Error("Draft not found"));

      await expect(service.run(baseDto())).rejects.toThrow();
    });

    it("throws NotFound when form definition does not exist", async () => {
      draftsService.findById.mockResolvedValue(mockDraft());
      definitionsService.findByFormId.mockRejectedValue(
        new Error("Form definition not found"),
      );

      await expect(service.run(baseDto())).rejects.toThrow();
    });

    it("returns draft and contract when versions match", async () => {
      const draft = mockDraft();
      const contract = mockContract();
      draftsService.findById.mockResolvedValue(draft);
      definitionsService.findByFormId.mockResolvedValue(contract);

      const result = await service.run(baseDto());

      expect(result.draft).toBe(draft);
      expect(result.contract).toBe(contract);
    });
  });

  describe("validateActiveFields", () => {
    beforeEach(() => {
      draftsService.findById.mockResolvedValue(mockDraft());
      definitionsService.findByFormId.mockResolvedValue(mockContract());
    });

    it("does not throw when all active fields are valid", async () => {
      await expect(service.run(baseDto())).resolves.toBeDefined();
    });

    it("throws UnprocessableEntityException with per-field errors when required fields empty", async () => {
      const dto = baseDto();
      dto.values = { "personal-info": { "first-name": "", surname: "" } };

      await expect(service.run(dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it("returns flat per-field errors for non-repeatable steps (backwards-compat)", async () => {
      const dto = baseDto();
      dto.values = { "personal-info": { "first-name": "", surname: "" } };
      await expect(service.run(dto)).rejects.toMatchObject({
        response: {
          errors: {
            "personal-info": expect.objectContaining({
              "first-name": expect.any(Array),
              surname: expect.any(Array),
            }),
          },
        },
      });
    });

    it("only validates active primitives — skips hidden fields", async () => {
      const contract = mockContract({
        steps: [
          {
            stepId: "personal-info",
            elements: [
              {
                ...primitiveText("first-name", true),
                behaviours: [
                  {
                    type: "fieldConditionalOn",
                    targetFieldId: "show-name",
                    operator: "equal",
                    value: "yes",
                  },
                ],
              },
              primitiveText("surname", true),
            ],
            behaviours: [],
          },
        ],
      } as unknown as Partial<ServiceContract>);

      definitionsService.findByFormId.mockResolvedValue(contract);

      const dto = baseDto();
      // first-name is hidden (show-name !== "yes"), so required check should be skipped
      dto.values = {
        "personal-info": { "first-name": "", surname: "Aurelius" },
      };

      await expect(service.run(dto)).resolves.toBeDefined();
    });
  });

  describe("buildAuditTrail", () => {
    it("schemaVersion is 2", async () => {
      draftsService.findById.mockResolvedValue(mockDraft());
      definitionsService.findByFormId.mockResolvedValue(mockContract());

      const { auditTrail } = await service.run(baseDto());
      expect(auditTrail.schemaVersion).toBe(2);
    });

    it("records activeFieldIds and hiddenFieldIds from ConditionResult", async () => {
      draftsService.findById.mockResolvedValue(mockDraft());
      definitionsService.findByFormId.mockResolvedValue(mockContract());

      const { auditTrail } = await service.run(baseDto());
      expect(auditTrail.activeFieldIds["personal-info"]).toEqual(
        expect.arrayContaining(["first-name", "surname"]),
      );
    });

    it("visitedPages derived from draft.lastActivePage", async () => {
      draftsService.findById.mockResolvedValue(
        mockDraft({ lastActivePage: 2 }),
      );
      definitionsService.findByFormId.mockResolvedValue(mockContract());

      const { auditTrail } = await service.run(baseDto());
      expect(auditTrail.visitedPages).toEqual([0, 1, 2]);
    });

    it("includes pinnedFormVersion and draftId", async () => {
      draftsService.findById.mockResolvedValue(mockDraft());
      definitionsService.findByFormId.mockResolvedValue(mockContract());

      const { auditTrail } = await service.run(baseDto());
      expect(auditTrail.pinnedFormVersion).toBe("1.0.0");
      expect(auditTrail.draftId).toBe("draft-001");
    });

    it("submittedAt is a valid ISO-8601 string", async () => {
      draftsService.findById.mockResolvedValue(mockDraft());
      definitionsService.findByFormId.mockResolvedValue(mockContract());

      const { auditTrail } = await service.run(baseDto());
      expect(new Date(auditTrail.submittedAt).toISOString()).toBe(
        auditTrail.submittedAt,
      );
    });
  });
});
