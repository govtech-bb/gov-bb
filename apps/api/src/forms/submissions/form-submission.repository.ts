import { DataSource, IsNull } from "typeorm";
import { Injectable } from "@nestjs/common";
import { BaseRepository } from "@/database/base.repository";
import { FormSubmissionEntity } from "@/database/entities/form-submission.entity";

@Injectable()
export class FormSubmissionRepository extends BaseRepository<FormSubmissionEntity> {
  constructor(dataSource: DataSource) {
    super(FormSubmissionEntity, dataSource.createEntityManager());
  }

  /** Persist the processor entry indices that failed to dispatch (#1747). */
  async markProcessorsFailed(
    submissionId: string,
    failedIndices: number[],
  ): Promise<void> {
    await this.update(submissionId, { processorsFailed: failedIndices });
  }

  /**
   * Records that CaMS accepted the case hand-off (#3714). Only the first time:
   * a retry or redrive that reaches CaMS again keeps the original moment. The
   * app's clock, as for submitted_at: the column has no time zone, so a
   * database now() would read back shifted by the app's offset.
   */
  async markCamsDelivered(submissionId: string): Promise<void> {
    await this.update(
      { id: submissionId, camsDeliveredAt: IsNull() },
      { camsDeliveredAt: new Date() },
    );
  }

  /**
   * The submission with this exact reference, or null, for the status lookup
   * (#3419). Reads only what a status answer needs: never `values` or `meta`,
   * which hold the applicant's answers.
   */
  findByReference(
    referenceCode: string,
  ): Promise<Pick<
    FormSubmissionEntity,
    "formId" | "submittedAt" | "camsDeliveredAt"
  > | null> {
    return this.findOne({
      where: { referenceCode },
      select: { formId: true, submittedAt: true, camsDeliveredAt: true },
    });
  }
}
