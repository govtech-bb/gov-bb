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
 *     - salary         number  required, gt: { referenceFieldId: "minimum-wage" }
 *     - minimum-wage   number  required, min: 0
 *
 *   Step: supporting-docs  (always visible)
 *     - upload-document  file  required, fileTypes: [".pdf",".jpg"], itemMaxSize: 5MB
 */

import { Test, TestingModule } from "@nestjs/testing";
import { UnprocessableEntityException } from "@nestjs/common";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { FormDefinitionsService } from "../form-definitions/form-definitions.service";
import { FormDraftsService } from "../form-drafts/form-drafts.service";
import { FilesService } from "../../files/files.service";

const filesStub = {
  verifySubmissionFiles: vi.fn().mockResolvedValue({}),
};
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
              referenceFieldId: "minimum-wage",
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
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        SubmissionPipelineService,
        {
          provide: FormDraftsService,
          useValue: { findById: vi.fn().mockResolvedValue(DRAFT) },
        },
        {
          provide: FormDefinitionsService,
          useValue: { findByFormId: vi.fn().mockResolvedValue(CONTRACT) },
        },
        { provide: FilesService, useValue: filesStub },
      ],
    }).compile();

    service = module.get(SubmissionPipelineService);
  });

  afterEach(async () => {
    if (module) await module.close();
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
      expect(
        (
          error!.getResponse() as {
            errors: Record<string, Record<string, string[]>>;
          }
        ).errors["employment-info"].salary,
      ).toContain("Salary must exceed minimum wage");
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
      expect(
        (
          error!.getResponse() as {
            errors: Record<string, Record<string, string[]>>;
          }
        ).errors["supporting-docs"]["upload-document"],
      ).toContain("Only PDF or JPG accepted");
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

  // ─── Validation: aggregates errors across all failing steps ───────────────

  describe("validation — aggregates errors across steps", () => {
    it("returns errors from every failing step, nested under stepId", async () => {
      const values = {
        "personal-info": {
          "first-name": "", // required → fails
          nationality: "JM", // valid — keeps employment-info active
        },
        "employment-info": {
          "employer-name": "", // required → also fails
          "contract-type": "temporary",
          salary: 50_000,
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
      const errors = (
        error!.getResponse() as {
          errors: Record<string, Record<string, string[]>>;
        }
      ).errors;

      expect(errors["personal-info"]["first-name"]).toBeDefined();
      expect(errors["employment-info"]["employer-name"]).toBeDefined();
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

    it("schemaVersion is 2", async () => {
      const { auditTrail } = await service.run(makeDto(VALUES));
      expect(auditTrail.schemaVersion).toBe(2);
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

// ─── Repeatable step handling (E2E pipeline) ────────────────────────────────

import type { RepeatableBehaviour } from "@govtech-bb/form-types";

// Test contract: one non-repeatable step + one repeatable step with a
// conditionally-required field inside.
const REPEAT_CONTRACT: ServiceContract = {
  formId: "f-repeat",
  title: "Repeatable",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  steps: [
    {
      stepId: "personal",
      title: "personal",
      behaviours: [],
      elements: [
        {
          fieldId: "first-name",
          label: "First name",
          htmlType: "text",
          validations: {
            required: { value: true, error: "First name is required" },
          },
        },
      ],
    },
    {
      stepId: "jobs",
      title: "jobs",
      behaviours: [
        { type: "repeatable", min: 1, max: 3 } as RepeatableBehaviour,
      ],
      elements: [
        {
          fieldId: "has-job",
          label: "Has job?",
          htmlType: "radio",
          options: [
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
          ],
          validations: {
            required: { value: true, error: "Select an option" },
          },
        },
        {
          fieldId: "employer",
          label: "Employer",
          htmlType: "text",
          behaviours: [
            {
              type: "fieldConditionalOn",
              targetFieldId: "has-job",
              operator: "equal",
              value: "yes",
            },
          ],
          validations: {
            required: { value: true, error: "Employer is required" },
          },
        },
      ],
    },
  ],
} as ServiceContract;

function buildModuleWith(contract: ServiceContract): Promise<{
  service: SubmissionPipelineService;
  module: TestingModule;
}> {
  return Test.createTestingModule({
    providers: [
      SubmissionPipelineService,
      {
        provide: FormDraftsService,
        useValue: { findById: vi.fn().mockResolvedValue(null) },
      },
      {
        provide: FormDefinitionsService,
        useValue: { findByFormId: vi.fn().mockResolvedValue(contract) },
      },
      { provide: FilesService, useValue: filesStub },
    ],
  })
    .compile()
    .then((m) => ({ service: m.get(SubmissionPipelineService), module: m }));
}

function repeatDto(values: Record<string, unknown>): SubmitDto {
  return {
    idempotencyKey: "ik",
    formId: "f-repeat",
    formVersion: "1.0.0",
    values: values as SubmitDto["values"],
  };
}

describe("repeatable step handling (E2E pipeline)", () => {
  let service: SubmissionPipelineService;
  let module: TestingModule;

  beforeEach(async () => {
    ({ service, module } = await buildModuleWith(REPEAT_CONTRACT));
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it("validates each instance independently — instance 0 valid, instance 1 missing required", async () => {
    const dto = repeatDto({
      personal: { "first-name": "Marcus" },
      jobs: [
        { "has-job": "yes", employer: "ACME" },
        { "has-job": "yes" }, // missing employer
      ],
    });

    await expect(service.run(dto)).rejects.toMatchObject({
      response: {
        errors: {
          jobs: {
            instances: [
              {},
              expect.objectContaining({ employer: expect.any(Array) }),
            ],
          },
        },
      },
    });
  });

  it("emits step-level _step error when count below min (empty array)", async () => {
    const dto = repeatDto({
      personal: { "first-name": "Marcus" },
      jobs: [],
    });

    await expect(service.run(dto)).rejects.toMatchObject({
      response: {
        errors: {
          jobs: {
            _step: [expect.stringMatching(/at least 1 entry/i)],
            instances: [],
          },
        },
      },
    });
  });

  it("evaluates fieldConditionalOn per instance — employer hidden when has-job=no", async () => {
    const dto = repeatDto({
      personal: { "first-name": "Marcus" },
      jobs: [
        { "has-job": "no" }, // employer hidden → not required
        { "has-job": "yes", employer: "Initech" },
      ],
    });

    const result = await service.run(dto);
    expect(result.normalizedValues.jobs).toEqual([
      { "has-job": "no" },
      { "has-job": "yes", employer: "Initech" },
    ]);
  });

  it("rejects unknown fieldIds inside a repeatable instance with 400, not 422", async () => {
    const dto = repeatDto({
      personal: { "first-name": "Marcus" },
      jobs: [{ "has-job": "no", addAnother: "no" }],
    });

    await expect(service.run(dto)).rejects.toMatchObject({
      response: {
        message: "Bad submission payload",
        errors: expect.arrayContaining([
          expect.objectContaining({
            stepId: "jobs",
            reason: "unknown_field",
            detail: expect.objectContaining({ fieldId: "addAnother" }),
          }),
        ]),
      },
    });
  });

  it("skips min enforcement when repeatable step is hidden by stepConditionalOn", async () => {
    const gatedContract: ServiceContract = {
      ...REPEAT_CONTRACT,
      steps: REPEAT_CONTRACT.steps.map((s) =>
        s.stepId !== "jobs"
          ? s
          : {
              ...s,
              behaviours: [
                { type: "repeatable", min: 1, max: 3 } as RepeatableBehaviour,
                {
                  type: "stepConditionalOn",
                  targetFieldId: "first-name",
                  targetStepId: "personal",
                  operator: "equal",
                  value: "show-jobs",
                } as never,
              ],
            },
      ),
    };
    const built = await buildModuleWith(gatedContract);
    service = built.service;
    if (module) await module.close();
    module = built.module;

    const dto = repeatDto({
      personal: { "first-name": "Marcus" }, // != "show-jobs" → step hidden
      // jobs omitted
    });

    const result = await service.run(dto);
    expect(result.normalizedValues.jobs).toBeUndefined();
  });

  it("persists normalized values — hidden field dropped from instance", async () => {
    const dto = repeatDto({
      personal: { "first-name": "Marcus" },
      jobs: [
        // employer is conditionally hidden when has-job=no; if present in
        // payload it must be dropped from storage.
        { "has-job": "no", employer: "leaked" },
      ],
    });

    const result = await service.run(dto);
    expect(result.normalizedValues.jobs).toEqual([{ "has-job": "no" }]);
  });

  it("audit trail schemaVersion=2 — repeatable step has string[][] activeFieldIds", async () => {
    const dto = repeatDto({
      personal: { "first-name": "Marcus" },
      jobs: [{ "has-job": "yes", employer: "ACME" }, { "has-job": "no" }],
    });

    const result = await service.run(dto);
    expect(result.auditTrail.schemaVersion).toBe(2);
    const jobsActive = result.auditTrail.activeFieldIds["jobs"];
    expect(Array.isArray(jobsActive)).toBe(true);
    // Repeatable with >1 instance → string[][].
    expect(Array.isArray((jobsActive as unknown[])[0])).toBe(true);
    // Instance 0 (has-job=yes): both has-job and employer active.
    expect((jobsActive as string[][])[0]).toEqual(
      expect.arrayContaining(["has-job", "employer"]),
    );
    // Instance 1 (has-job=no): only has-job; employer hidden.
    expect((jobsActive as string[][])[1]).toEqual(["has-job"]);
  });
});

// ─── optionalIf — relax required without hiding the field ───────────────────

// Test contract: a gate field controls whether `extra-detail` is required.
// `extra-detail` is always visible; when `wants-extra === "no"` its `optionalIf`
// matches and `required` is relaxed. A minLength format rule applies whenever
// the field is filled, regardless of the optional state.
const OPTIONAL_CONTRACT: ServiceContract = {
  formId: "f-optional",
  title: "Optional",
  version: "1.0.0",
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  steps: [
    {
      stepId: "gate",
      title: "gate",
      behaviours: [],
      elements: [
        {
          fieldId: "wants-extra",
          label: "Wants extra?",
          htmlType: "text",
          validations: {
            required: { value: true, error: "Answer is required" },
          },
        },
      ],
    },
    {
      stepId: "details",
      title: "details",
      behaviours: [],
      elements: [
        {
          fieldId: "extra-detail",
          label: "Extra detail",
          htmlType: "text",
          behaviours: [
            {
              type: "optionalIf",
              targetFieldId: "wants-extra",
              targetStepId: "gate",
              operator: "equal",
              value: "no",
            },
          ],
          validations: {
            required: { value: true, error: "Extra detail is required" },
            minLength: { value: 3, error: "Extra detail too short" },
          },
        },
      ],
    },
  ],
} as ServiceContract;

function optionalDto(values: Record<string, unknown>): SubmitDto {
  return {
    idempotencyKey: "ik-opt",
    formId: "f-optional",
    formVersion: "1.0.0",
    values: values as SubmitDto["values"],
  };
}

describe("optionalIf — conditional required (E2E pipeline)", () => {
  let service: SubmissionPipelineService;
  let module: TestingModule;

  beforeEach(async () => {
    ({ service, module } = await buildModuleWith(OPTIONAL_CONTRACT));
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it("passes when the optionalIf condition matches and the field is empty", async () => {
    const dto = optionalDto({
      gate: { "wants-extra": "no" },
      details: { "extra-detail": "" },
    });

    await expect(service.run(dto)).resolves.toBeDefined();
  });

  it("returns 422 when the condition is false and the field is empty", async () => {
    const dto = optionalDto({
      gate: { "wants-extra": "yes" },
      details: { "extra-detail": "" },
    });

    await expect(service.run(dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("keeps the field in normalizedValues — never hidden/dropped — when optional and empty", async () => {
    const dto = optionalDto({
      gate: { "wants-extra": "no" },
      details: { "extra-detail": "" },
    });

    const result = await service.run(dto);
    expect(result.normalizedValues.details).toHaveProperty("extra-detail", "");
  });

  it("still fails the format rule when filled with a malformed value even though optionalIf matches", async () => {
    const dto = optionalDto({
      gate: { "wants-extra": "no" }, // optionalIf matches → required relaxed
      details: { "extra-detail": "ab" }, // but filled + too short → minLength fires
    });

    await expect(service.run(dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("passes and persists the value when filled validly while optional", async () => {
    const dto = optionalDto({
      gate: { "wants-extra": "no" },
      details: { "extra-detail": "abcd" },
    });

    const result = await service.run(dto);
    expect(result.normalizedValues.details).toHaveProperty(
      "extra-detail",
      "abcd",
    );
  });
});
