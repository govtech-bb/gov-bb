import { Injectable, NotFoundException } from "@nestjs/common";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import { validate as validateFields } from "@govtech-bb/form-validation";
import type {
  ServiceContract,
  RepeatableBehaviour,
  Primitive,
} from "@govtech-bb/form-types";
import type { FormDraftEntity } from "../../database/entities/form-draft.entity";
import { FormDefinitionsService } from "../form-definitions/form-definitions.service";
import { FormDraftsService } from "../form-drafts/form-drafts.service";
import { FilesService } from "../../files/files.service";
import { AppError } from "../../common/errors";
import { expandSubmission, type StepInstance } from "./submission-expand";
import {
  foldErrors,
  type PerInstanceErrors,
  type StepLevelErrors,
} from "./submission-fold";
import { normalizeForStorage } from "./submission-normalize";
import type {
  SubmissionAuditTrailV2,
  SubmissionValues,
  SubmitDto,
} from "./submissions.types";

export interface PipelineResult {
  draft: FormDraftEntity | null;
  contract: ServiceContract;
  auditTrail: SubmissionAuditTrailV2;
  normalizedValues: SubmissionValues;
}

// `optionalIf`: when a field's condition matches, its `required` rule is relaxed
// so the field may be left empty — but it is never hidden, and all other
// (format) rules are preserved so they still fire when it is filled. Clone the
// primitive without its `required` validation; everything else is untouched.
function relaxRequired(primitive: Primitive): Primitive {
  if (!primitive.validations?.required) return primitive;
  const { required: _required, ...rest } = primitive.validations;
  return { ...primitive, validations: rest };
}

@Injectable()
export class SubmissionPipelineService {
  constructor(
    private readonly formDraftsService: FormDraftsService,
    private readonly formDefinitionsService: FormDefinitionsService,
    private readonly filesService: FilesService,
  ) {}

  async run(dto: SubmitDto): Promise<PipelineResult> {
    const { draft, contract } = await this.pinVersion(dto);

    const expanded = expandSubmission(contract, dto.values, {
      draftId: dto.draftId,
    });
    if (expanded.shapeErrors.length > 0) {
      throw AppError.badRequest({
        message: "Bad submission payload",
        errors: expanded.shapeErrors,
      });
    }

    const cond = evaluateFormConditions(contract, dto.values);

    const { perInstanceErrors, stepLevelErrors } = this.validate(
      contract,
      expanded.instances,
      cond,
      dto.values,
    );

    const bundle = foldErrors({
      instances: expanded.instances,
      perInstanceErrors,
      stepLevelErrors,
    });
    if (Object.keys(bundle).length > 0) {
      throw AppError.unprocessable(bundle);
    }

    const fileFieldsByStep = FilesService.collectFileFieldsByStep(contract);

    const fileBundle = await this.filesService.verifySubmissionFiles(
      fileFieldsByStep,
      dto.values,
    );
    if (Object.keys(fileBundle).length > 0) {
      throw AppError.unprocessable(fileBundle);
    }

    const normalizedValues = normalizeForStorage({
      instances: expanded.instances,
      hiddenStepIds: cond.hiddenStepIds,
      activeFieldsByInstance: cond.activeFieldsByInstance,
      fileFieldsByStep,
    });

    const auditTrail = this.buildAuditTrail(dto, draft, cond);

    return { draft, contract, auditTrail, normalizedValues };
  }

  private async pinVersion(
    dto: SubmitDto,
  ): Promise<{ draft: FormDraftEntity | null; contract: ServiceContract }> {
    if (!dto.draftId) {
      const contract = await this.resolveSubmittableContract({
        formId: dto.formId,
        version: dto.formVersion,
      });
      return { draft: null, contract };
    }

    const draft = await this.formDraftsService.findById(dto.draftId);
    const contract = await this.resolveSubmittableContract({
      formId: dto.formId,
      version: draft.formVersion,
    });

    return { draft, contract };
  }

  /**
   * Resolve the recipe to submit against. `findByFormId` (with
   * `includeProcessors`) resolves from published FILE recipes only (outside
   * dev) and throws a NotFoundException when the version isn't a published
   * file — including for a DB-only draft version previewed via `?preview=`.
   *
   * To avoid an opaque 404 for that case, on a NotFoundException we probe the
   * DB-consulting preview path (`getRecipe({ preview: true })`): if the version
   * exists as an unpublished draft, surface a clear 400; if it's genuinely
   * unknown, re-throw the original 404. Any non-NotFound error is re-thrown
   * unchanged.
   */
  private async resolveSubmittableContract({
    formId,
    version,
  }: {
    formId: string;
    version: string;
  }): Promise<ServiceContract> {
    try {
      return await this.formDefinitionsService.findByFormId({
        formId,
        version,
        includeProcessors: true,
      });
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;

      const previewRecipe = await this.formDefinitionsService.getRecipe({
        formId,
        version,
        preview: true,
      });
      if (previewRecipe) {
        throw AppError.badRequest(
          "This version is an unpublished preview and cannot be submitted. Publish the form before submitting.",
        );
      }

      throw err;
    }
  }

  private validate(
    contract: ServiceContract,
    instances: StepInstance[],
    cond: ReturnType<typeof evaluateFormConditions>,
    allValues: SubmissionValues,
  ): {
    perInstanceErrors: PerInstanceErrors;
    stepLevelErrors: StepLevelErrors;
  } {
    const perInstanceErrors: PerInstanceErrors = new Map();
    const stepLevelErrors: StepLevelErrors = new Map();

    // Min is only enforced when the step is visible AND present in the
    // payload. An omitted step is treated as not-yet-reached (matches
    // non-repeatable behaviour); `[]` is "reached with zero entries" and
    // triggers min. Max is enforced in expand.
    const submittedStepIds = new Set(instances.map((i) => i.stepId));
    for (const step of contract.steps) {
      if (cond.hiddenStepIds.has(step.stepId)) continue;
      const repeatable = step.behaviours?.find(
        (b): b is RepeatableBehaviour => b.type === "repeatable",
      );
      if (!repeatable) continue;
      const hasKey =
        submittedStepIds.has(step.stepId) ||
        Object.prototype.hasOwnProperty.call(allValues, step.stepId);
      if (!hasKey) continue;
      const count = instances.filter((i) => i.stepId === step.stepId).length;
      if (count < repeatable.min) {
        stepLevelErrors.set(step.stepId, [
          `Provide at least ${repeatable.min} entr${repeatable.min === 1 ? "y" : "ies"}`,
        ]);
      }
    }

    // Per-instance field validation.
    for (const instance of instances) {
      if (cond.hiddenStepIds.has(instance.stepId)) continue;
      const step = contract.steps.find((s) => s.stepId === instance.stepId);
      if (!step) continue;

      const activeIds =
        cond.activeFieldsByInstance.get(instance.stepId)?.[instance.index] ??
        new Set<string>();
      const optionalIds =
        cond.optionalFieldsByInstance.get(instance.stepId)?.[instance.index] ??
        new Set<string>();
      const activePrimitives = step.elements
        .filter((p) => activeIds.has(p.fieldId))
        .map((p) => (optionalIds.has(p.fieldId) ? relaxRequired(p) : p));

      const result = validateFields({
        primitives: activePrimitives,
        stepValues: instance.values,
        allValues,
      });

      if (!result.valid) {
        perInstanceErrors.set(
          `${instance.stepId}:${instance.index}`,
          result.errors,
        );
      }
    }

    return { perInstanceErrors, stepLevelErrors };
  }

  private buildAuditTrail(
    dto: SubmitDto,
    draft: FormDraftEntity | null,
    cond: ReturnType<typeof evaluateFormConditions>,
  ): SubmissionAuditTrailV2 {
    const visitedPages = draft
      ? Array.from({ length: draft.lastActivePage + 1 }, (_, i) => i)
      : [];

    const activeFieldIds: Record<string, string[] | string[][]> = {};
    const hiddenFieldIds: Record<string, string[] | string[][]> = {};

    for (const [stepId, instArr] of cond.activeFieldsByInstance) {
      if (instArr.length === 1) {
        activeFieldIds[stepId] = Array.from(instArr[0]);
      } else {
        activeFieldIds[stepId] = instArr.map((s) => Array.from(s));
      }
    }
    for (const [stepId, instArr] of cond.hiddenFieldsByInstance) {
      if (instArr.length === 1) {
        hiddenFieldIds[stepId] = Array.from(instArr[0]);
      } else {
        hiddenFieldIds[stepId] = instArr.map((s) => Array.from(s));
      }
    }
    for (const stepId of cond.hiddenStepIds) {
      const flat = cond.hiddenFieldIds.get(stepId);
      if (flat) hiddenFieldIds[stepId] = Array.from(flat);
    }

    return {
      schemaVersion: 2,
      pinnedFormVersion: draft?.formVersion ?? dto.formVersion,
      draftId: dto.draftId ?? null,
      activeStepIds: Array.from(cond.activeStepIds),
      hiddenStepIds: Array.from(cond.hiddenStepIds),
      activeFieldIds,
      hiddenFieldIds,
      visitedPages,
      submittedAt: new Date().toISOString(),
    };
  }
}
