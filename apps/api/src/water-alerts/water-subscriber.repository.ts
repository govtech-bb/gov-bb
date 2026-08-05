import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { WaterSubscriberEntity } from "@govtech-bb/database";
import { BaseRepository } from "../database/base.repository";

/** A matched (notice, recipient) pair — used only for the dry-run plan. */
export interface MatchedRecipient {
  noticeId: string;
  email: string;
}

/** TypeORM repository for water-alert subscribers. */
@Injectable()
export class WaterSubscriberRepository extends BaseRepository<WaterSubscriberEntity> {
  constructor(dataSource: DataSource) {
    super(WaterSubscriberEntity, dataSource.createEntityManager());
  }

  /**
   * Confirmed recipients matching the given (notice_id, area) pairs, in one
   * set-based query (parallel arrays zipped by `unnest`). Used by the dry-run to
   * show who WOULD be emailed without claiming or sending.
   */
  async matchedRecipients(
    noticeIds: string[],
    areas: string[],
  ): Promise<MatchedRecipient[]> {
    if (noticeIds.length === 0) return [];
    return this.manager.query(
      `SELECT DISTINCT p."notice_id" AS "noticeId", s."email" AS "email"
       FROM unnest($1::text[], $2::text[]) AS p("notice_id", "area")
       JOIN "water_subscribers" s
         ON s."area" = p."area" AND s."status" = 'confirmed'`,
      [noticeIds, areas],
    );
  }
}
