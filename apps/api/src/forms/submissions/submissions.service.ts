import { HttpStatus, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { DeepPartial } from "typeorm";
import {
  FormSubmissionStatus,
  FormSubmissionEntity,
} from "@/database/entities/form-submission.entity";
import { AppError } from "@/common/errors";
import { ExpressionsService } from "@/expressions/expressions.service";
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
    // #1196: versionless submissions persist form_version = NULL (the recipe
    // resolves to the canonical flat file). A draft-sourced submission carries
    // its draft's pin (may itself be null) for the legacy fallback window.
    const pinnedVersion = draft?.formVersion ?? dto.formVersion ?? null;

    // Smoke submissions exercise the full persist/validate/reference-code path
    // but must fire zero processors (no real emails/webhooks/payment gating, and
    // no case-management dispatch). Dropping them here, the single choke point
    // for the `processors[]` array, makes hasGating false (→ SUBMITTED +
    // submittedAt), emits an event carrying no processors, and the
    // SubmissionProcessorListener dispatch loop iterates nothing. Every
    // submission side-effect is now `processors[]`-driven, so this one drop
    // covers them all (#1252).
    const rawProcessors = dto.isSmokeSubmission
      ? []
      : (contract.processors ?? []);
    const split = this.processorFactory.resolveSplit(rawProcessors);

    // A payment whose fee resolves to 0 (a fee-waiver branch / dynamic
    // expression) is not a real payment: gating it would create a Payment row,
    // open an EzPay session, and email the citizen "Amount due: $0.00 — Pay
    // now" (#1449). Resolve the amount up front (ResolutionContext.submission is
    // optional, so values + meta suffice before the entity exists) and drop the
    // zero-amount payment from the gating set, so the submission proceeds as a
    // normal SUBMITTED submission. Only the exact number 0 un-gates; a negative
    // / non-numeric amount stays gated and is rejected by the processor's
    // existing post-resolution validation. Dropping only the payment entry
    // (rather than clearing all gating) leaves any other gating processor
    // intact — payment is the only gatesPipeline type today, but this does not
    // rely on that.
    const paymentConfig = rawProcessors.find((p) => p.type === "payment");
    const paymentIsNoOp =
      paymentConfig !== undefined &&
      this.expressions.resolveConfig(
        paymentConfig.config as Record<string, unknown>,
        {
          values: normalizedValues,
          meta: auditTrail as unknown as Record<string, unknown>,
        },
      ).amount === 0;
    const gatingProcessors = paymentIsNoOp
      ? split.gating.filter((p) => p.type !== "payment")
      : split.gating;
    const hasGating = gatingProcessors.length > 0;

    const saved = await this.saveWithUniqueReference(
      dto.formId,
      idempotencyKey,
      {
        idempotencyKey,
        formId: dto.formId,
        formVersion: pinnedVersion,
        values: normalizedValues,
        meta: auditTrail as unknown as Record<string, unknown>,
        status: hasGating
          ? FormSubmissionStatus.PENDING_PAYMENT
          : FormSubmissionStatus.SUBMITTED,
        ...(hasGating ? {} : { submittedAt: new Date() }),
      },
    );

    const event: SubmissionCreatedEvent = {
      submissionId: saved.id,
      referenceCode: saved.referenceCode,
      formId: dto.formId,
      formVersion: pinnedVersion ?? undefined,
      idempotencyKey: dto.idempotencyKey,
      processors: rawProcessors,
      values: normalizedValues,
      meta: auditTrail,
      isSmokeSubmission: dto.isSmokeSubmission,
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
      for (const processor of gatingProcessors) {
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

  /**
   * Persist a submission with a freshly minted, unique reference code.
   *
   * Uniqueness is enforced by the DB unique constraint
   * (`UQ_form_submissions_reference_code`), not by trusting the randomness: on a
   * collision the insert fails with a 23505 and we regenerate and retry. The
   * idempotency double-check inside the tx still short-circuits a genuine
   * duplicate submission (returning the existing row, with its own reference).
   */
  private async saveWithUniqueReference(
    formId: string,
    idempotencyKey: string,
    entityData: DeepPartial<FormSubmissionEntity>,
  ): Promise<FormSubmissionEntity> {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const referenceCode = generateReferenceCode(formId);
      try {
        return await this.submissionRepo.tx(async (repo) => {
          const doubleCheck = await repo.findOne({
            where: { idempotencyKey },
            lock: { mode: "pessimistic_write" },
          });
          if (doubleCheck) return doubleCheck;
          return repo.save(repo.create({ ...entityData, referenceCode }));
        });
      } catch (err) {
        if (isReferenceCodeConflict(err) && attempt < MAX_ATTEMPTS - 1) {
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `Could not generate a unique reference code after ${MAX_ATTEMPTS} attempts`,
    );
  }
}

/** True when an error is a Postgres unique-violation (23505) on the
 * reference_code constraint — i.e. a reference collision worth retrying. */
function isReferenceCodeConflict(err: unknown): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    driverError?: { code?: string; constraint?: string };
  };
  const code = e?.driverError?.code ?? e?.code;
  const constraint = e?.driverError?.constraint ?? e?.constraint;
  return code === "23505" && (constraint?.includes("reference_code") ?? false);
}
