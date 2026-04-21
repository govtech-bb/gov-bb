/**
 * Integration test — conditions + validation through a real ServiceContract.
 *
 * Nothing is mocked except the two DB services (FormDraftsService,
 * FormDefinitionsService). evaluateFormConditions and validate run for real.
 *
 * Form under test: Benefit Application
 *
 *   Step: personal-info   (always visible)
 *     - first-name   text     required
 *     - nationality  select   required
 *
 *   Step: employment-info  (visible only when nationality === "JM")
 *     - employer-name  text    required, minLength: 2
 *     - job-title      text    required  [visible only when contract-type === "permanent"]
 *     - contract-type  text    required
 *     - salary         number  required, gt: { reference: "minimum-wage" }
 *     - minimum-wage   number  required, min: 0
 *
 *   Step: supporting-docs  (always visible)
 *     - upload-document  file  required, fileTypes: [".pdf",".jpg"], itemMaxSize: 5MB
 */

import { Test } from "@nestjs/testing";
import { UnprocessableEntityException } from "@nestjs/common";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { FormDefinitionsService } from "../form-definitions/form-definitions.service";
import { FormDraftsService } from "../form-drafts/form-drafts.service";
import type { ServiceContract } from "@govtech-bb/form-types";
import type { FormDraftEntity } from "../../database/entities/form-draft.entity";
import type { SubmitDto } from "./submissions.types";

// ─── Contract ────────────────────────────────────────────────────────────────

const CONTRACT: ServiceContract = {
  formId: "benefit-application",
  title: "Benefit Application",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  steps: [
    {
      stepId: "personal-info",
      title: "Personal Information",
      behaviours: [],
      elements: [
        {
          fieldId: "first-name",
          label: "First name",
          htmlType: "text",
          behaviours: [],
          validations: { required: {} },
        },
        {
          fieldId: "nationality",
          label: "Nationality",
          htmlType: "select",
          options: [
            { label: "Jamaica", value: "JM" },
            { label: "USA", value: "US" },
          ],
          behaviours: [],
          validations: { required: {} },
        },
      ],
    },
    {
      stepId: "employment-info",
      title: "Employment Information",
      behaviours: [
        {
          type: "stepConditionalOn",
          targetFieldId: "nationality",
          targetStepId: "personal-info",
          operator: "equal",
          value: "JM",
        },
      ],
      elements: [
        {
          fieldId: "employer-name",
          label: "Employer name",
          htmlType: "text",
          behaviours: [],
          validations: {
            required: { error: "Employer name is required" },
            minLength: { value: 2, error: "Employer name too short" },
          },
        },
        {
          fieldId: "job-title",
          label: "Job title",
          htmlType: "text",
          behaviours: [
            {
              type: "fieldConditionalOn",
              targetFieldId: "contract-type",
              targetStepId: "employment-info",
              operator: "equal",
              value: "permanent",
            },
          ],
          validations: { required: { error: "Job title is required" } },
        },
        {
          fieldId: "contract-type",
          label: "Contract type",
          htmlType: "text",
          behaviours: [],
          validations: { required: { error: "Contract type is required" } },
        },
        {
          fieldId: "salary",
          label: "Annual salary",
          htmlType: "number",
          behaviours: [],
          validations: {
            required: { error: "Salary is required" },
            gt: {
              reference: "minimum-wage",
              targetStepId: "employment-info",
              error: "Salary must exceed minimum wage",
            },
          },
        },
        {
          fieldId: "minimum-wage",
          label: "Minimum wage",
          htmlType: "number",
          behaviours: [],
          validations: {
            required: { error: "Minimum wage is required" },
            min: { value: 0 },
          },
        },
      ],
    },
    {
      stepId: "supporting-docs",
      title: "Supporting Documents",
      behaviours: [],
      elements: [
        {
          fieldId: "upload-document",
          label: "National ID copy",
          htmlType: "file",
          multiple: true,
          behaviours: [],
          validations: {
            required: { error: "Please upload your National ID" },
            fileTypes: {
              value: [".pdf", ".jpg"],
              error: "Only PDF or JPG accepted",
            },
            itemMaxSize: {
              value: 5_242_880,
              error: "Each file must be under 5MB",
            },
          },
        },
      ],
    },
  ],
  processors: [],
} as unknown as ServiceContract;

// ─── Draft ───────────────────────────────────────────────────────────────────

const DRAFT: FormDraftEntity = {
  draftId: "draft-001",
  formId: "benefit-application",
  formVersion: "1.0.0",
  lastActivePage: 2,
  values: {},
  status: "active",
} as unknown as FormDraftEntity;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDto(values: Record<string, Record<string, unknown>>): SubmitDto {
  return {
    idempotencyKey: "idem-001",
    formId: "benefit-application",
    formVersion: "1.0.0",
    draftId: "draft-001",
    values,
  };
}

const PDF_FILE = [{ name: "id.pdf", size: 1_200_000, type: "application/pdf" }];

// ─── Setup ───────────────────────────────────────────────────────────────────

describe("SubmissionPipelineService — integration (real conditions + validation)", () => {
  let service: SubmissionPipelineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SubmissionPipelineService,
        {
          provide: FormDraftsService,
          useValue: { findById: jest.fn().mockResolvedValue(DRAFT) },
        },
        {
          provide: FormDefinitionsService,
          useValue: { findByFormId: jest.fn().mockResolvedValue(CONTRACT) },
        },
      ],
    }).compile();

    service = module.get(SubmissionPipelineService);
  });

  // ─── Happy path ────────────────────────────────────────────────────────────

  describe("happy path — JM nationality, employment step visible, temporary contract", () => {
    const VALUES = {
      "personal-info": {
        "first-name": "Marcus",
        nationality: "JM",
      },
      "employment-info": {
        "employer-name": "Ministry of Finance",
        "contract-type": "temporary", // job-title is hidden
        salary: 85_000,
        "minimum-wage": 40_000,
      },
      "supporting-docs": {
        "upload-document": PDF_FILE,
      },
    };

    it("resolves without throwing", async () => {
      await expect(service.run(makeDto(VALUES))).resolves.toBeDefined();
    });

    it("audit trail lists all three steps as active", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.activeStepIds).toEqual(
        expect.arrayContaining([
          "personal-info",
          "employment-info",
          "supporting-docs",
        ]),
      );
      expect(auditTrail.hiddenStepIds).toHaveLength(0);
    });

    it("job-title is in hiddenFieldIds because contract-type is temporary", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.hiddenFieldIds["employment-info"]).toContain(
        "job-title",
      );
    });

    it("active fields for employment-info exclude job-title", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.activeFieldIds["employment-info"]).not.toContain(
        "job-title",
      );
      expect(auditTrail.activeFieldIds["employment-info"]).toEqual(
        expect.arrayContaining([
          "employer-name",
          "contract-type",
          "salary",
          "minimum-wage",
        ]),
      );
    });

    it("visitedPages covers all pages from draft.lastActivePage", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.visitedPages).toEqual([0, 1, 2]);
    });
  });

  // ─── Condition: employment step hidden ─────────────────────────────────────

  describe("condition — nationality is US → employment-info hidden", () => {
    const VALUES = {
      "personal-info": {
        "first-name": "Alice",
        nationality: "US",
      },
      // employment-info submitted anyway (stale client data)
      "employment-info": {
        "employer-name": "", // would fail required if validated
        "contract-type": "permanent",
        salary: 0,
        "minimum-wage": 40_000,
      },
      "supporting-docs": {
        "upload-document": PDF_FILE,
      },
    };

    it("resolves without throwing — employment-info is skipped entirely", async () => {
      await expect(service.run(makeDto(VALUES))).resolves.toBeDefined();
    });

    it("employment-info is in hiddenStepIds", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.hiddenStepIds).toContain("employment-info");
    });

    it("all employment-info fields are in hiddenFieldIds", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.hiddenFieldIds["employment-info"]).toEqual(
        expect.arrayContaining([
          "employer-name",
          "job-title",
          "contract-type",
          "salary",
          "minimum-wage",
        ]),
      );
    });
  });

  // ─── Condition: job-title visible when contract-type = permanent ───────────

  describe("condition — contract-type is permanent → job-title required", () => {
    it("throws 422 when job-title is empty and contract-type is permanent", async () => {
      const values = {
        "personal-info": {
          "first-name": "Marcus",
          nationality: "JM",
        },
        "employment-info": {
          "employer-name": "Ministry",
          "contract-type": "permanent",
          "job-title": "", // visible and empty → required fires
          salary: 85_000,
          "minimum-wage": 40_000,
        },
        "supporting-docs": {
          "upload-document": PDF_FILE,
        },
      };

      await expect(service.run(makeDto(values))).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it("resolves when job-title is filled and contract-type is permanent", async () => {
      const values = {
        "personal-info": {
          "first-name": "Marcus",
          nationality: "JM",
        },
        "employment-info": {
          "employer-name": "Ministry",
          "contract-type": "permanent",
          "job-title": "Senior Analyst",
          salary: 85_000,
          "minimum-wage": 40_000,
        },
        "supporting-docs": {
          "upload-document": PDF_FILE,
        },
      };

      await expect(service.run(makeDto(values))).resolves.toBeDefined();
    });
  });

  // ─── Validation: cross-field salary > minimum-wage ─────────────────────────

  describe("validation — cross-field: salary must exceed minimum-wage", () => {
    it("throws 422 when salary is below minimum-wage", async () => {
      const values = {
        "personal-info": {
          "first-name": "Marcus",
          nationality: "JM",
        },
        "employment-info": {
          "employer-name": "Ministry",
          "contract-type": "temporary",
          salary: 30_000, // below minimum-wage
          "minimum-wage": 40_000,
        },
        "supporting-docs": {
          "upload-document": PDF_FILE,
        },
      };

      let error: UnprocessableEntityException | undefined;
      try {
        await service.run(makeDto(values));
      } catch (e) {
        error = e as UnprocessableEntityException;
      }

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error!.getResponse() as any).errors.salary).toContain(
        "Salary must exceed minimum wage",
      );
    });

    it("resolves when salary exceeds minimum-wage", async () => {
      const values = {
        "personal-info": {
          "first-name": "Marcus",
          nationality: "JM",
        },
        "employment-info": {
          "employer-name": "Ministry",
          "contract-type": "temporary",
          salary: 85_000,
          "minimum-wage": 40_000,
        },
        "supporting-docs": {
          "upload-document": PDF_FILE,
        },
      };

      await expect(service.run(makeDto(values))).resolves.toBeDefined();
    });
  });

  // ─── Validation: file rules ────────────────────────────────────────────────

  describe("validation — file: wrong type", () => {
    it("throws 422 when upload has a disallowed file type", async () => {
      const values = {
        "personal-info": {
          "first-name": "Marcus",
          nationality: "JM",
        },
        "employment-info": {
          "employer-name": "Ministry",
          "contract-type": "temporary",
          salary: 85_000,
          "minimum-wage": 40_000,
        },
        "supporting-docs": {
          "upload-document": [{ name: "resume.docx", size: 500_000 }],
        },
      };

      let error: UnprocessableEntityException | undefined;
      try {
        await service.run(makeDto(values));
      } catch (e) {
        error = e as UnprocessableEntityException;
      }

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error!.getResponse() as any).errors["upload-document"]).toContain(
        "Only PDF or JPG accepted",
      );
    });
  });

  describe("validation — file: file too large", () => {
    it("throws 422 when a single file exceeds itemMaxSize", async () => {
      const values = {
        "personal-info": {
          "first-name": "Marcus",
          nationality: "JM",
        },
        "employment-info": {
          "employer-name": "Ministry",
          "contract-type": "temporary",
          salary: 85_000,
          "minimum-wage": 40_000,
        },
        "supporting-docs": {
          "upload-document": [{ name: "huge.pdf", size: 9_000_000 }], // > 5MB
        },
      };

      await expect(service.run(makeDto(values))).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  // ─── Validation: stops at first failing step ───────────────────────────────

  describe("validation — stops at first failing step", () => {
    it("only returns errors from personal-info when it fails, not from later steps", async () => {
      const values = {
        "personal-info": {
          "first-name": "", // required → fails
          nationality: "", // required → fails
        },
        "employment-info": {
          "employer-name": "", // would also fail required, but never reached
          "contract-type": "temporary",
          salary: 0,
          "minimum-wage": 40_000,
        },
        "supporting-docs": {
          "upload-document": PDF_FILE,
        },
      };

      let error: UnprocessableEntityException | undefined;
      try {
        await service.run(makeDto(values));
      } catch (e) {
        error = e as UnprocessableEntityException;
      }

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const errors = (error!.getResponse() as any).errors;

      // personal-info errors are present
      expect(errors["first-name"]).toBeDefined();
      expect(errors["nationality"]).toBeDefined();

      // employment-info errors are NOT present — pipeline stopped at personal-info
      expect(errors["employer-name"]).toBeUndefined();
    });
  });

  // ─── Audit trail accuracy ──────────────────────────────────────────────────

  describe("audit trail — schema", () => {
    const VALUES = {
      "personal-info": {
        "first-name": "Marcus",
        nationality: "JM",
      },
      "employment-info": {
        "employer-name": "Ministry",
        "contract-type": "temporary",
        salary: 85_000,
        "minimum-wage": 40_000,
      },
      "supporting-docs": {
        "upload-document": PDF_FILE,
      },
    };

    it("schemaVersion is 1", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.schemaVersion).toBe(1);
    });

    it("pinnedFormVersion matches draft", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.pinnedFormVersion).toBe("1.0.0");
    });

    it("submittedAt is a valid ISO-8601 string", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(new Date(auditTrail.submittedAt).toISOString()).toBe(
        auditTrail.submittedAt,
      );
    });
  });
});
