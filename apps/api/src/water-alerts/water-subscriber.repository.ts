import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { WaterSubscriberEntity } from "@govtech-bb/database";
import { BaseRepository } from "../database/base.repository";

/** TypeORM repository for water-alert subscribers. */
@Injectable()
export class WaterSubscriberRepository extends BaseRepository<WaterSubscriberEntity> {
  constructor(dataSource: DataSource) {
    super(WaterSubscriberEntity, dataSource.createEntityManager());
  }
}
