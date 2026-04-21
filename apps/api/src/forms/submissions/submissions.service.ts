import { HttpStatus, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { FormSubmissionStatus } from "../../database/entities/form-submission.entity";
import { AppError } from "../../common/errors";
import { FormSubmissionRepository } from "./form-submission.repository";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import type {
  SubmitDto,
  SubmitResult,
  SubmissionCreatedEvent,
} from "./submissions.types";

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly submissionRepo: FormSubmissionRepository,
    private readonly pipeline: SubmissionPipelineService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async submit(dto: SubmitDto): Promise<SubmitResult> {
    const { idempotencyKey } = dto;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw AppError.badRequest("Idempotency-Key header is required");
    }

    const existing = await this.submissionRepo.findOne({
      where: { idempotencyKey },
    });

    if (existing) {
      const isProcessing = existing.status === FormSubmissionStatus.PROCESSING;
      return {
        outcome: isProcessing ? "in_progress" : "duplicate",
        data: existing,
        message: isProcessing
          ? "Submission is currently being processed"
          : "Submission already exists",
        statusCode: isProcessing ? HttpStatus.ACCEPTED : HttpStatus.OK,
      };
    }

    const { draft, contract, auditTrail } = await this.pipeline.run(dto);

    const saved = await this.submissionRepo.tx(async (repo) => {
      const doubleCheck = await repo.findOne({
        where: { idempotencyKey },
        lock: { mode: "pessimistic_write" },
      });

      if (doubleCheck) {
        return doubleCheck;
      }

      const entity = repo.create({
        idempotencyKey,
        formId: dto.formId,
        formVersion: draft.formVersion,
        values: dto.values,
        meta: auditTrail as unknown as Record<string, unknown>,
        status: FormSubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      });

      return repo.save(entity);
    });

    const event: SubmissionCreatedEvent = {
      submissionId: saved.id,
      formId: dto.formId,
      formVersion: draft.formVersion,
      processors: contract.processors ?? [],
      values: dto.values,
      meta: auditTrail,
    };

    this.eventEmitter.emit("submission.created", event);

    return {
      outcome: "created",
      data: saved,
      message: "Submission created",
      statusCode: HttpStatus.CREATED,
    };
  }
}
