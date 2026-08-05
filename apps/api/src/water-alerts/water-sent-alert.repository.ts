import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { WaterSentAlertEntity } from "@govtech-bb/database";
import { BaseRepository } from "../database/base.repository";

/** One pending (unsent) alert joined with its subscriber's delivery details. */
export interface PendingAlert {
  noticeId: string;
  subscriberId: string;
  email: string;
  area: string;
  unsubscribeToken: string;
}

@Injectable()
export class WaterSentAlertRepository extends BaseRepository<WaterSentAlertEntity> {
  constructor(dataSource: DataSource) {
    super(WaterSentAlertEntity, dataSource.createEntityManager());
  }

  /**
   * Claim (notice, subscriber) pairs for every confirmed subscriber matching the
   * given (notice_id, area) pairs — in a SINGLE set-based statement, whatever the
   * subscriber count. `noticeIds[i]`/`areas[i]` are parallel arrays zipped by
   * `unnest`; the join finds confirmed subscribers, and UNIQUE(notice_id,
   * subscriber_id) + ON CONFLICT DO NOTHING makes it idempotent (the exactly-once
   * guarantee). No per-subscriber round-trips.
   */
  async claimForPairs(noticeIds: string[], areas: string[]): Promise<void> {
    if (noticeIds.length === 0) return;
    await this.manager.query(
      `INSERT INTO "water_sent_alerts" ("notice_id", "subscriber_id")
       SELECT p."notice_id", s."id"
       FROM unnest($1::text[], $2::text[]) AS p("notice_id", "area")
       JOIN "water_subscribers" s
         ON s."area" = p."area" AND s."status" = 'confirmed'
       ON CONFLICT ("notice_id", "subscriber_id") DO NOTHING`,
      [noticeIds, areas],
    );
  }

  /**
   * Claimed-but-not-yet-sent alerts for the given active notices, with the
   * subscriber's email/area/unsubscribe token. Covers both brand-new claims and
   * ones whose send failed on a previous run (retry). One query.
   */
  async pendingUnsent(noticeIds: string[]): Promise<PendingAlert[]> {
    if (noticeIds.length === 0) return [];
    return this.manager.query(
      `SELECT sa."notice_id"        AS "noticeId",
              sa."subscriber_id"    AS "subscriberId",
              s."email"             AS "email",
              s."area"              AS "area",
              s."unsubscribe_token" AS "unsubscribeToken"
       FROM "water_sent_alerts" sa
       JOIN "water_subscribers" s ON s."id" = sa."subscriber_id"
       WHERE sa."sent" = false AND sa."notice_id" = ANY($1::text[])`,
      [noticeIds],
    );
  }

  /**
   * Mark a batch of claimed alerts as sent — one statement for the whole batch.
   * `noticeIds[i]`/`subscriberIds[i]` are parallel arrays zipped by `unnest`.
   */
  async markManySent(
    noticeIds: string[],
    subscriberIds: string[],
  ): Promise<void> {
    if (noticeIds.length === 0) return;
    await this.manager.query(
      `UPDATE "water_sent_alerts" sa SET "sent" = true
       FROM unnest($1::text[], $2::uuid[]) AS b("notice_id", "subscriber_id")
       WHERE sa."notice_id" = b."notice_id"
         AND sa."subscriber_id" = b."subscriber_id"`,
      [noticeIds, subscriberIds],
    );
  }
}
