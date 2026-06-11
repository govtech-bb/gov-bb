import { HttpStatus, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { FormSubmissionStatus } from "../../database/entities/form-submission.entity";
import { AppError } from "../../common/errors";
import { ExpressionsService } from "../../expressions/expressions.service";
import { FormSubmissionRepository } from "./form-submission.repository";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { ProcessorFactory } from "./processors/processor-factory.service";
import { generateReferenceCode } from "./reference-code";
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
    private readonly processorFactory: ProcessorFactory,
    private readonly expressions: ExpressionsService,
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

    const { draft, contract, auditTrail, normalizedValues } =
      await this.pipeline.run(dto);
    const pinnedVersion = draft?.formVersion ?? dto.formVersion;

    // Smoke submissions exercise the full persist/validate/reference-code path
    // but must fire zero processors (no real emails/webhooks/payment gating).
    // Dropping them here, the single choke point, makes hasGating false (→
    // SUBMITTED + submittedAt), emits an event carrying no processors, and the
    // listener's dispatch loop iterates nothing (#1252).
    const rawProcessors = dto.isSmokeSubmission
      ? []
      : (contract.processors ?? []);
    const split = this.processorFactory.resolveSplit(rawProcessors);
    const hasGating = split.gating.length > 0;

    const referenceCode = await this.generateUniqueReferenceCode(dto.formId);

    const saved = await this.submissionRepo.tx(async (repo) => {
      const doubleCheck = await repo.findOne({
        where: { idempotencyKey },
        lock: { mode: "pessimistic_write" },
      });
      if (doubleCheck) return doubleCheck;
      const entity = repo.create({
        idempotencyKey,
        referenceCode,
        formId: dto.formId,
        formVersion: pinnedVersion,
        values: normalizedValues,
        meta: auditTrail as unknown as Record<string, unknown>,
        status: hasGating
          ? FormSubmissionStatus.PENDING_PAYMENT
          : FormSubmissionStatus.SUBMITTED,
        ...(hasGating ? {} : { submittedAt: new Date() }),
      });
      return repo.save(entity);
    });

    const event: SubmissionCreatedEvent = {
      submissionId: saved.id,
      referenceCode,
      formId: dto.formId,
      formVersion: pinnedVersion,
      idempotencyKey: dto.idempotencyKey,
      processors: rawProcessors,
      values: normalizedValues,
      meta: auditTrail,
    };

    if (hasGating) {
      const resolvedForGating = this.expressions.resolveProcessors(
        rawProcessors,
        {
          values: normalizedValues,
          meta: auditTrail as unknown as Record<string, unknown>,
          submission: {
            id: saved.id,
            formId: dto.formId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      );
      const gatingEvent: SubmissionCreatedEvent = {
        ...event,
        processors: resolvedForGating,
      };

      // First deferred wins; later gating processors still run for their side-effects
      // (e.g. persisting their own state) but their `data` is discarded.
      let deferred: SubmitResult["deferred"];
      for (const processor of split.gating) {
        const output = await processor.process(gatingEvent);
        if (output.kind === "deferred" && !deferred) {
          deferred = output.data;
        }
      }

      return {
        outcome: "created",
        data: saved,
        message: "Payment required",
        statusCode: HttpStatus.OK,
        deferred,
      };
    }

    this.eventEmitter.emit("submission.created", event);

    return {
      outcome: "created",
      data: saved,
      message: "Submission created",
      statusCode: HttpStatus.CREATED,
    };
  }

  private async generateUniqueReferenceCode(formId: string): Promise<string> {
    const MAX_ATTEMPTS = 5;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const code = generateReferenceCode(formId);
      const taken = await this.submissionRepo.count({
        where: { referenceCode: code },
      });
      if (taken === 0) return code;
    }
    throw new Error(
      `Could not generate unique reference code after ${MAX_ATTEMPTS} attempts`,
    );
  }
}
