import { Test, TestingModule } from "@nestjs/testing";
import { HttpStatus } from "@nestjs/common";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { SubmissionPayloadSizePipe } from "./submission-payload-size.pipe";
import type { FormSubmissionEntity } from "../../database/entities/form-submission.entity";
import { FormSubmissionStatus } from "../../database/entities/form-submission.entity";
import type { CreateSubmissionDto } from "./dto";

function makeEntity(
  overrides: Partial<FormSubmissionEntity> = {},
): FormSubmissionEntity {
  return {
    id: "uuid-sub-1",
    idempotencyKey: "key-abc",
    formId: "test-form",
    formVersion: "1.0.0",
    status: FormSubmissionStatus.SUBMITTED,
    values: { "step-1": { field1: "value1" } },
    meta: null,
    submittedAt: new Date("2026-04-01T00:00:00Z"),
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  } as FormSubmissionEntity;
}

const baseDto: CreateSubmissionDto = {
  formId: "test-form",
  formVersion: "1.0.0",
  values: { "step-1": { field1: "value1" } },
};

describe("SubmissionsController", () => {
  let controller: SubmissionsController;
  let service: jest.Mocked<Pick<SubmissionsService, "submit">>;
  let module: TestingModule;

  beforeEach(async () => {
    service = { submit: jest.fn() };

    module = await Test.createTestingModule({
      controllers: [SubmissionsController],
      providers: [
        { provide: SubmissionsService, useValue: service },
        SubmissionPayloadSizePipe,
      ],
    }).compile();

    controller = module.get(SubmissionsController);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  describe("create (POST /submissions)", () => {
    it("returns a success response with the submission entity", async () => {
      const entity = makeEntity();
      (service.submit as jest.Mock).mockResolvedValue({
        data: entity,
        message: "Submission created",
        statusCode: HttpStatus.CREATED,
        deferred: undefined,
      });

      const result = await controller.create("key-abc", baseDto);

      expect(service.submit).toHaveBeenCalledWith({
        ...baseDto,
        idempotencyKey: "key-abc",
      });
      expect(result).toMatchObject({
        status: "success",
        message: "Submission created",
        statusCode: HttpStatus.CREATED,
        data: entity,
      });
      expect(result.meta).toBeUndefined();
    });

    it("includes meta.deferred when service returns a deferred payload", async () => {
      const entity = makeEntity({
        status: FormSubmissionStatus.PENDING_PAYMENT,
      });
      const deferredData = {
        paymentUrl: "https://pay.example/abc",
        paymentId: "pay-1",
        amount: 1000,
        description: "Form fee",
      };

      (service.submit as jest.Mock).mockResolvedValue({
        data: entity,
        message: "Payment required",
        statusCode: HttpStatus.OK,
        deferred: deferredData,
      });

      const result = await controller.create("key-abc", baseDto);

      expect(result).toMatchObject({
        status: "success",
        message: "Payment required",
        statusCode: HttpStatus.OK,
        data: entity,
        meta: { deferred: deferredData },
      });
    });

    it("does NOT include meta when deferred is undefined/falsy", async () => {
      const entity = makeEntity();
      (service.submit as jest.Mock).mockResolvedValue({
        data: entity,
        message: "Submission created",
        statusCode: HttpStatus.CREATED,
        deferred: undefined,
      });

      const result = await controller.create("key-abc", baseDto);

      expect("meta" in result).toBe(false);
    });

    it("returns 200 with no meta for a duplicate submission", async () => {
      const entity = makeEntity({ status: FormSubmissionStatus.SUBMITTED });
      (service.submit as jest.Mock).mockResolvedValue({
        data: entity,
        message: "Submission already exists",
        statusCode: HttpStatus.OK,
        deferred: undefined,
      });

      const result = await controller.create("key-abc", baseDto);

      expect(result).toMatchObject({
        status: "success",
        message: "Submission already exists",
        statusCode: HttpStatus.OK,
        data: entity,
      });
    });

    it("returns 202 for an in-progress submission", async () => {
      const entity = makeEntity({ status: FormSubmissionStatus.PROCESSING });
      (service.submit as jest.Mock).mockResolvedValue({
        data: entity,
        message: "Submission is currently being processed",
        statusCode: HttpStatus.ACCEPTED,
        deferred: undefined,
      });

      const result = await controller.create("key-abc", baseDto);

      expect(result).toMatchObject({
        status: "success",
        message: "Submission is currently being processed",
        statusCode: HttpStatus.ACCEPTED,
        data: entity,
      });
    });

    it("propagates errors thrown by the service", async () => {
      (service.submit as jest.Mock).mockRejectedValue(
        new Error("Validation failed"),
      );

      await expect(controller.create("key-abc", baseDto)).rejects.toThrow(
        "Validation failed",
      );
    });

    it("passes idempotencyKey from headers to the service", async () => {
      const entity = makeEntity();
      (service.submit as jest.Mock).mockResolvedValue({
        data: entity,
        message: "Submission created",
        statusCode: HttpStatus.CREATED,
        deferred: undefined,
      });

      await controller.create("unique-idem-key-xyz", baseDto);

      expect(service.submit).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "unique-idem-key-xyz" }),
      );
    });

    it("passes all body fields to the service", async () => {
      const entity = makeEntity();
      (service.submit as jest.Mock).mockResolvedValue({
        data: entity,
        message: "Submission created",
        statusCode: HttpStatus.CREATED,
        deferred: undefined,
      });

      const dtoWithDraft: CreateSubmissionDto & { draftId?: string } = {
        formId: "my-form",
        formVersion: "2.0.0",
        draftId: "draft-001",
        values: { "step-1": { field1: "hello" } },
      };

      await controller.create("key-xyz", dtoWithDraft);

      expect(service.submit).toHaveBeenCalledWith({
        formId: "my-form",
        formVersion: "2.0.0",
        draftId: "draft-001",
        values: { "step-1": { field1: "hello" } },
        idempotencyKey: "key-xyz",
      });
    });
  });
});
