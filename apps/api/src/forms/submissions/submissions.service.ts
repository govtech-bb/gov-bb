import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { DeepPartial } from "typeorm";
import {
  FormSubmissionStatus,
  FormSubmissionEntity,
} from "@/database/entities/form-submission.entity";
import { AppError } from "@/common/errors";
import { isFormClosed } from "@govtech-bb/form-types";
import { ExpressionsService } from "@/expressions/expressions.service";
import { CatchmentRoutingService } from "@/catchment/catchment-routing.service";
import { fillParishRoutingCoordinate } from "@/catchment/parish-routing-point";
import { FormSubmissionRepository } from "./form-submission.repository";
import { SubmissionPipelineService } from "./submission-pipeline.service";
import { ProcessorFactory } from "./processors/processor-factory.service";
import {
  generateReferenceCode,
  referencePrefixFromProcessors,
} from "./reference-code";
import {
  programmeCodeFromProcessors,
  readPath,
} from "./processors/webhook-mapping";
import type {
  SubmitDto,
  SubmitResult,
  SubmissionCreatedEvent,
  SubmissionValues,
} from "./submissions.types";

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly submissionRepo: FormSubmissionRepository,
    private readonly pipeline: SubmissionPipelineService,
    private readonly eventEmitter: EventEmitter2,
    private readonly processorFactory: ProcessorFactory,
    private readonly expressions: ExpressionsService,
    private readonly catchmentRouting: CatchmentRoutingService,
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
      // A replay is a refresh or a retry of a submission that already routed, so
      // it has to name the same polyclinic the first response did — otherwise
      // the confirmation page falls back to "your local polyclinic" for a
      // submission that went somewhere specific. Re-derived from the stored
      // values, which is why the coordinate is persisted.
      const resolvedPolyclinic = await this.polyclinicForStored(existing);
      return {
        outcome: isProcessing ? "in_progress" : "duplicate",
        data: existing,
        message: isProcessing
          ? "Submission is currently being processed"
          : "Submission already exists",
        statusCode: isProcessing ? HttpStatus.ACCEPTED : HttpStatus.OK,
        ...(resolvedPolyclinic && { resolvedPolyclinic }),
      };
    }

    const {
      draft,
      contract,
      auditTrail,
      normalizedValues: pipelineValues,
    } = await this.pipeline.run(dto);

    // #1936: reject a submission whose form has closed. The UI gates this too,
    // but a direct POST would otherwise slip through. Smoke submissions bypass
    // so the live-smoke gate is never blocked by a form's deadline.
    if (
      !dto.isSmokeSubmission &&
      isFormClosed(contract.closingDateTime, new Date())
    ) {
      throw AppError.badRequest("Applications for this form have closed");
    }

    // A catchment-routed form MUST end up with a coordinate: the polyclinic
    // named on the confirmation page, the CMS programme code and the MDA inbox
    // all come from resolving one. The coordinate is written by an address
    // lookup, which a free-typed address or a /geocode outage skips — so fill it
    // from the parish the citizen selected, and reject the submission when there
    // is no routable parish either, rather than routing it nowhere and telling
    // the citizen to contact "your local polyclinic".
    const normalizedValues = contract.catchmentRouting
      ? fillParishRoutingCoordinate(pipelineValues, contract.catchmentRouting)
      : pipelineValues;

    if (
      contract.catchmentRouting &&
      !readPath(normalizedValues, contract.catchmentRouting.coordinatesField)
    ) {
      const { parishField } = contract.catchmentRouting;
      const dot = parishField.indexOf(".");
      throw AppError.unprocessable({
        [parishField.slice(0, dot)]: {
          [parishField.slice(dot + 1)]: [
            "Select the parish so we can send your application to the right Environmental Health office",
          ],
        },
      });
    }

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

    // The MDA-PROG prefix is declared on the recipe (#2318), so it costs no DB
    // read and is identical in every environment. Resolved once, outside the
    // mint retry loop.
    const referencePrefix = referencePrefixFromProcessors(rawProcessors);

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
      referencePrefix,
    );

    // Coordinate-based catchment routing: when the recipe declares which fields
    // hold the event coordinates + parish, resolve the serving polyclinic once
    // here and attach it to the event so both the webhook (programme_code) and
    // the MDA email (catchment.mdaEmail recipient) agree. Absent block → undefined.
    const routing = contract.catchmentRouting;
    const resolvedCatchment = routing
      ? (this.catchmentRouting.resolve({
          formId: dto.formId,
          // The recipe's own programme code, which the per-catchment code is
          // composed from. Read from `contract.processors`, not the
          // smoke-emptied `rawProcessors` — the code is the form's identity,
          // not a side effect of which processors happen to fire.
          programmeCode: programmeCodeFromProcessors(contract.processors ?? []),
          coordinates:
            readPath(normalizedValues, routing.coordinatesField) ?? undefined,
          parish: readPath(normalizedValues, routing.parishField) ?? undefined,
        }) ?? undefined)
      : undefined;

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
      resolvedCatchment,
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
        ...(resolvedCatchment && {
          resolvedPolyclinic: resolvedCatchment.polyclinic,
        }),
      };
    }

    this.eventEmitter.emit("submission.created", event);

    return {
      outcome: "created",
      data: saved,
      message: "Submission created",
      statusCode: HttpStatus.CREATED,
      ...(resolvedCatchment && {
        resolvedPolyclinic: resolvedCatchment.polyclinic,
      }),
    };
  }

  /**
   * The polyclinic an already-persisted submission routed to, or undefined when
   * its form is not catchment-routed (or the recipe can no longer be resolved —
   * a replay must not fail just because the routing lookup did).
   */
  private async polyclinicForStored(
    submission: FormSubmissionEntity,
  ): Promise<string | undefined> {
    try {
      const contract = await this.pipeline.resolveContract(submission.formId);
      const routing = contract.catchmentRouting;
      if (!routing) return undefined;
      const values = submission.values as SubmissionValues;
      return this.catchmentRouting.resolve({
        formId: submission.formId,
        programmeCode: programmeCodeFromProcessors(contract.processors ?? []),
        coordinates: readPath(values, routing.coordinatesField) ?? undefined,
        parish: readPath(values, routing.parishField) ?? undefined,
      })?.polyclinic;
    } catch (err) {
      // Degrade to the generic confirmation copy rather than failing a replay of
      // a submission the API has already accepted — but say so, because it means
      // the recipe no longer resolves for a form that has live submissions.
      this.logger.warn(
        `[catchment] replay could not re-derive the polyclinic for submission "${submission.id}" (form "${submission.formId}"): ${String(err)}`,
      );
      return undefined;
    }
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
    referencePrefix?: string,
  ): Promise<FormSubmissionEntity> {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const referenceCode = generateReferenceCode(formId, {
        prefix: referencePrefix,
      });
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
