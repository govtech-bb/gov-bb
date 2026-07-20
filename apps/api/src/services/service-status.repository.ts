import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { BaseRepository } from "@/database/base.repository";
import { ServiceStatusEntity } from "@/database/entities/service-status.entity";

@Injectable()
export class ServiceStatusRepository extends BaseRepository<ServiceStatusEntity> {
  constructor(dataSource: DataSource) {
    super(ServiceStatusEntity, dataSource.createEntityManager());
  }
}
