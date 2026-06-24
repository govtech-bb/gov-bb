import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BaseRepository } from "@/database/base.repository";
import { FormDraftEntity } from "@/database/entities/form-draft.entity";

@Injectable()
export class FormDraftRepository extends BaseRepository<FormDraftEntity> {
  constructor(dataSource: DataSource) {
    super(FormDraftEntity, dataSource.createEntityManager());
  }
}
