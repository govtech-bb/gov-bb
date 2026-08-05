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
   * Claim the right to email this subscriber about this notice. The
   * UNIQUE(notice_id, subscriber_id) constraint makes this idempotent: the
   * first caller inserts the row, any later/concurrent caller is a no-op — so
   * the same notice never reaches the same person twice.
   */
  async claim(noticeId: string, subscriberId: string): Promise<void> {
    await this.manager.query(
      `INSERT INTO "water_sent_alerts" ("notice_id", "subscriber_id")
       VALUES ($1, $2)
       ON CONFLICT ("notice_id", "subscriber_id") DO NOTHING`,
      [noticeId, subscriberId],
    );
  }

  /**
   * Claimed-but-not-yet-sent alerts for the given active notices, with the
   * subscriber's email/area/unsubscribe token. Covers both brand-new claims and
   * ones whose send failed on a previous run (retry).
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
       WHERE sa."sent" = false AND sa."notice_id" = ANY($1)`,
      [noticeIds],
    );
  }

  /** Mark a claimed alert as truly sent, once the email has gone out. */
  async markSent(noticeId: string, subscriberId: string): Promise<void> {
    await this.update({ noticeId, subscriberId }, { sent: true });
  }
}
