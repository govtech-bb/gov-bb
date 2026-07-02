import { DataSource } from "typeorm";
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
}
