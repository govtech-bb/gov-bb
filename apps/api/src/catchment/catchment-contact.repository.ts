import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BaseRepository } from "@/database/base.repository";
import { CatchmentContactEntity } from "@/database/entities/catchment-contact.entity";

@Injectable()
export class CatchmentContactRepository extends BaseRepository<CatchmentContactEntity> {
  constructor(dataSource: DataSource) {
    super(CatchmentContactEntity, dataSource.createEntityManager());
  }
}
