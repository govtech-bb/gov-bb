import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BaseRepository } from "../../database/base.repository";
import { MdaContactEntity } from "../../database/entities/mda-contact.entity";

@Injectable()
export class MdaContactRepository extends BaseRepository<MdaContactEntity> {
  constructor(dataSource: DataSource) {
    super(MdaContactEntity, dataSource.createEntityManager());
  }
}
