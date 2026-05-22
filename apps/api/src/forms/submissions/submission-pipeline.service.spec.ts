import { Test, TestingModule } from "@nestjs/testing";
import { UnprocessableEntityException } from "@nestjs/common";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { FormDefinitionsService } from "../form-definitions/form-definitions.service";
import { FormDraftsService } from "../form-drafts/form-drafts.service";
import { FilesService } from "../../files/files.service";
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
        {
          provide: FilesService,
          useValue: { verifySubmissionFiles: jest.fn().mockResolvedValue({}) },
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

    it("visitedPages is empty when draft is null (no-draft path)", async () => {
      // Branch: `draft ? [...] : []` — the else arm
      definitionsService.findByFormId.mockResolvedValue(mockContract());

      const dto = { ...baseDto(), draftId: undefined };
      const { auditTrail } = await service.run(dto);
      expect(auditTrail.visitedPages).toEqual([]);
    });

    it("hiddenFieldIds is populated for a hidden step that has hiddenFieldIds entry", async () => {
      // Branch: `if (flat) hiddenFieldIds[stepId]` — the if-taken arm via a hidden step
      // We need a step that is conditionally hidden so hiddenFieldIds.get(stepId) returns a Set.
      // The correct step-level behaviour type is "stepConditionalOn".
      const contract = mockContract({
        steps: [
          {
            stepId: "trigger-step",
            elements: [primitiveText("show-toggle")],
            behaviours: [],
          },
          {
            stepId: "conditional-step",
            elements: [primitiveText("hidden-field")],
            behaviours: [
              {
                type: "stepConditionalOn",
                targetFieldId: "show-toggle",
                operator: "equal",
                value: "yes",
              } as any,
            ],
          },
        ],
      } as unknown as Partial<ServiceContract>);

      definitionsService.findByFormId.mockResolvedValue(contract);

      // The step is hidden because show-toggle !== "yes"
      const dto = {
        ...baseDto(),
        draftId: undefined,
        values: { "trigger-step": { "show-toggle": "no" } },
      };

      const { auditTrail } = await service.run(dto);
      // The step is hidden — hiddenStepIds should contain it
      expect(auditTrail.hiddenStepIds).toContain("conditional-step");
      // The branch `if (flat) hiddenFieldIds[stepId]` should have populated hiddenFieldIds
      expect(auditTrail.hiddenFieldIds["conditional-step"]).toContain(
        "hidden-field",
      );
    });
  });

  describe("validate — uncovered branch paths", () => {
    it("stepLevelErrors includes plural 'ies' message when min > 1", async () => {
      // Branch: `repeatable.min === 1 ? "y" : "ies"` — the "ies" arm
      // For a repeatable step, foldErrors wraps errors as { _step: [...], instances: [...] }
      const contract = mockContract({
        steps: [
          {
            stepId: "repeatable-step",
            elements: [primitiveText("field-a")],
            behaviours: [{ type: "repeatable", min: 2, max: 5 }],
          },
        ],
      } as unknown as Partial<ServiceContract>);
      definitionsService.findByFormId.mockResolvedValue(contract);
      draftsService.findById.mockResolvedValue(mockDraft());

      // Provide exactly one entry (below min of 2) so stepLevelErrors fires
      const dto = {
        ...baseDto(),
        values: {
          "repeatable-step": [{ "field-a": "entry-1" }],
        },
      };

      await expect(service.run(dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errors: expect.objectContaining({
            "repeatable-step": expect.objectContaining({
              _step: expect.arrayContaining([expect.stringContaining("ies")]),
            }),
          }),
        }),
      });
    });

    it("skips repeatable min check when step is not in submitted payload (!hasKey path)", async () => {
      // Branch: `if (!hasKey) continue` — step has repeatable but stepId absent from allValues
      const contract = mockContract({
        steps: [
          {
            stepId: "personal-info",
            elements: [
              primitiveText("first-name", true),
              primitiveText("surname", true),
            ],
            behaviours: [],
          },
          {
            stepId: "optional-repeatable",
            elements: [primitiveText("extra-field")],
            behaviours: [{ type: "repeatable", min: 1, max: 5 }],
          },
        ],
      } as unknown as Partial<ServiceContract>);
      definitionsService.findByFormId.mockResolvedValue(contract);
      draftsService.findById.mockResolvedValue(mockDraft());

      // Only provide the required step; omit optional-repeatable entirely
      const dto = {
        ...baseDto(),
        values: {
          "personal-info": { "first-name": "Marcus", surname: "Aurelius" },
        },
      };

      // Should resolve without stepLevel errors since the step key is absent
      await expect(service.run(dto)).resolves.toBeDefined();
    });

    it("stepLevelErrors uses singular 'entry' message when min === 1", async () => {
      // Branch: `repeatable.min === 1 ? "y" : "ies"` — the "y" arm
      const contract = mockContract({
        steps: [
          {
            stepId: "singular-step",
            elements: [primitiveText("field-b")],
            behaviours: [{ type: "repeatable", min: 1, max: 3 }],
          },
        ],
      } as unknown as Partial<ServiceContract>);
      definitionsService.findByFormId.mockResolvedValue(contract);
      draftsService.findById.mockResolvedValue(mockDraft());

      // Provide an empty array (count=0 < min=1)
      const dto = {
        ...baseDto(),
        values: {
          "singular-step": [],
        },
      };

      await expect(service.run(dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errors: expect.objectContaining({
            "singular-step": expect.objectContaining({
              _step: expect.arrayContaining([expect.stringContaining("entry")]),
            }),
          }),
        }),
      });
    });
  });

  describe("buildAuditTrail — multi-instance branches", () => {
    it("encodes activeFieldIds as string[][] for repeatable steps (multiple instances)", async () => {
      // Branch: `instArr.length !== 1` for activeFieldsByInstance
      // A repeatable step with multiple instances will have instArr.length > 1
      const contract = mockContract({
        steps: [
          {
            stepId: "repeatable-step",
            elements: [primitiveText("field-a"), primitiveText("field-b")],
            behaviours: [{ type: "repeatable", min: 1, max: 5 }],
          },
        ],
      } as unknown as Partial<ServiceContract>);
      definitionsService.findByFormId.mockResolvedValue(contract);
      draftsService.findById.mockResolvedValue(mockDraft());

      // Submit two instances
      const dto = {
        ...baseDto(),
        values: {
          "repeatable-step": [
            { "field-a": "a1", "field-b": "b1" },
            { "field-a": "a2", "field-b": "b2" },
          ],
        },
      };

      const { auditTrail } = await service.run(dto);

      // Should be an array of arrays (one inner array per instance)
      expect(Array.isArray(auditTrail.activeFieldIds["repeatable-step"])).toBe(
        true,
      );
      const perInstance = auditTrail.activeFieldIds[
        "repeatable-step"
      ] as string[][];
      expect(perInstance).toHaveLength(2);
      expect(perInstance[0]).toEqual(
        expect.arrayContaining(["field-a", "field-b"]),
      );
    });
  });
});
