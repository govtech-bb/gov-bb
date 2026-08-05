import { Injectable } from "@nestjs/common";
import { DataSource, In } from "typeorm";
import {
  WaterSubscriberEntity,
  WaterSubscriberStatus,
} from "@govtech-bb/database";
import { BaseRepository } from "../database/base.repository";

/** TypeORM repository for water-alert subscribers. */
@Injectable()
export class WaterSubscriberRepository extends BaseRepository<WaterSubscriberEntity> {
  constructor(dataSource: DataSource) {
    super(WaterSubscriberEntity, dataSource.createEntityManager());
  }

  /** Confirmed subscribers whose area is one of `areas` (e.g. a parish + "all"). */
  findConfirmedForAreas(areas: string[]): Promise<WaterSubscriberEntity[]> {
    return this.find({
      where: { status: WaterSubscriberStatus.CONFIRMED, area: In(areas) },
    });
  }
}
