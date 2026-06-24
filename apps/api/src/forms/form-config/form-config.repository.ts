import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BaseRepository } from "@/database/base.repository";
import { FormConfigEntity } from "@/database/entities/form-config.entity";

@Injectable()
export class FormConfigRepository extends BaseRepository<FormConfigEntity> {
  constructor(dataSource: DataSource) {
    super(FormConfigEntity, dataSource.createEntityManager());
  }
}
