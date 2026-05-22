import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BaseRepository } from "../../database/base.repository";
import { FormDisabledOverrideEntity } from "../../database/entities/form-disabled-override.entity";

@Injectable()
export class FormDisabledOverrideRepository extends BaseRepository<FormDisabledOverrideEntity> {
  constructor(dataSource: DataSource) {
    super(FormDisabledOverrideEntity, dataSource.createEntityManager());
  }
}
