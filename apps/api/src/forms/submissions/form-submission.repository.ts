import { DataSource } from "typeorm";
import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../database/base.repository";
import { FormSubmissionEntity } from "../../database/entities/form-submission.entity";

@Injectable()
export class FormSubmissionRepository extends BaseRepository<FormSubmissionEntity> {
  constructor(dataSource: DataSource) {
    super(FormSubmissionEntity, dataSource.createEntityManager());
  }
}
