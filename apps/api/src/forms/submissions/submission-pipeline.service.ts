import { Injectable } from "@nestjs/common";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import { validate } from "@govtech-bb/form-validation";
import type { ServiceContract } from "@govtech-bb/form-types";
import type { FormDraftEntity } from "../../database/entities/form-draft.entity";
import { FormDefinitionsService } from "../form-definitions/form-definitions.service";
import { FormDraftsService } from "../form-drafts/form-drafts.service";
import { AppError } from "../../common/errors";
import type {
  StepScopedValues,
  SubmissionAuditTrail,
  SubmitDto,
} from "./submissions.types";

export interface PipelineResult {
  draft: FormDraftEntity | null;
  contract: ServiceContract;
  auditTrail: SubmissionAuditTrail;
}

@Injectable()
export class SubmissionPipelineService {
  constructor(
    private readonly formDraftsService: FormDraftsService,
    private readonly formDefinitionsService: FormDefinitionsService,
  ) {}

  async run(dto: SubmitDto): Promise<PipelineResult> {
    const { draft, contract } = await this.pinVersion(dto);
    const conditionResult = this.evaluateConditions(contract, dto.values);
    this.validateActiveFields(contract, dto.values, conditionResult);
    const auditTrail = this.buildAuditTrail(dto, draft, conditionResult);
    return { draft, contract, auditTrail };
  }

  private async pinVersion(
    dto: SubmitDto,
  ): Promise<{ draft: FormDraftEntity | null; contract: ServiceContract }> {
    if (!dto.draftId) {
      const contract = await this.formDefinitionsService.findByFormId({
        formId: dto.formId,
        version: dto.formVersion,
        includeProcessors: true,
      });
      return { draft: null, contract };
    }

    const draft = await this.formDraftsService.findById(dto.draftId);
    const contract = await this.formDefinitionsService.findByFormId({
      formId: dto.formId,
      version: draft.formVersion,
      includeProcessors: true,
    });

    return { draft, contract };
  }

  private evaluateConditions(
    contract: ServiceContract,
    values: StepScopedValues,
  ) {
    return evaluateFormConditions(contract, values);
  }

  private validateActiveFields(
    contract: ServiceContract,
    values: StepScopedValues,
    conditionResult: ReturnType<typeof evaluateFormConditions>,
  ): void {
    for (const step of contract.steps) {
      if (!conditionResult.activeStepIds.has(step.stepId)) continue;

      const activeFieldIds =
        conditionResult.activeFieldIds.get(step.stepId) ?? new Set<string>();
      const activePrimitives = step.elements.filter((p) =>
        activeFieldIds.has(p.fieldId),
      );

      const result = validate({
        primitives: activePrimitives,
        stepValues: values[step.stepId] ?? {},
        allValues: values,
      });

      if (!result.valid) {
        throw AppError.unprocessable(result.errors);
      }
    }
  }

  private buildAuditTrail(
    dto: SubmitDto,
    draft: FormDraftEntity | null,
    conditionResult: ReturnType<typeof evaluateFormConditions>,
  ): SubmissionAuditTrail {
    const visitedPages = draft
      ? Array.from({ length: draft.lastActivePage + 1 }, (_, i) => i)
      : [];

    const activeFieldIds: Record<string, string[]> = {};
    for (const [stepId, fieldSet] of conditionResult.activeFieldIds) {
      activeFieldIds[stepId] = Array.from(fieldSet);
    }

    const hiddenFieldIds: Record<string, string[]> = {};
    for (const [stepId, fieldSet] of conditionResult.hiddenFieldIds) {
      hiddenFieldIds[stepId] = Array.from(fieldSet);
    }

    return {
      schemaVersion: 1,
      pinnedFormVersion: draft?.formVersion ?? dto.formVersion,
      draftId: dto.draftId ?? null,
      activeStepIds: Array.from(conditionResult.activeStepIds),
      hiddenStepIds: Array.from(conditionResult.hiddenStepIds),
      activeFieldIds,
      hiddenFieldIds,
      visitedPages,
      submittedAt: new Date().toISOString(),
    };
  }
}
