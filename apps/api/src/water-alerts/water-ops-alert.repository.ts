import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { WaterOpsAlertEntity } from "@govtech-bb/database";
import { BaseRepository } from "../database/base.repository";

/** A failure the caller should email about now. */
export interface FailureAlert {
  kind: "first" | "reminder";
  failingSince: Date;
}

/**
 * What the alert checker has already told the ops team (#2970). Several API
 * tasks can report the same failure, so each "should I email?" decision is a
 * single atomic statement: only the task that gets a row back sends.
 */
@Injectable()
export class WaterOpsAlertRepository extends BaseRepository<WaterOpsAlertEntity> {
  constructor(dataSource: DataSource) {
    super(WaterOpsAlertEntity, dataSource.createEntityManager());
  }

  /**
   * Record that `key` is failing. Returns the alert to send only when the last
   * alert for this key is older than `remindAfter` (a Postgres interval, e.g.
   * "6 hours"); otherwise null. That applies to a *new* failure too, so a
   * failure that flaps (fail, recover, fail…) is emailed at most once per
   * interval rather than every run. failing_since is always recorded.
   * NOW() is fixed per transaction, so "alerted" means this statement moved
   * last_alerted_at, and "first" means this failure started now.
   */
  async recordFailure(
    key: string,
    remindAfter: string,
  ): Promise<FailureAlert | null> {
    const rows: Array<{
      failingSince: Date;
      alerted: boolean;
      first: boolean;
    }> = await this.manager.query(
      `INSERT INTO "water_ops_alerts" ("key", "failing_since", "last_alerted_at")
         VALUES ($1, NOW(), NOW())
         ON CONFLICT ("key") DO UPDATE SET
           "failing_since" = COALESCE("water_ops_alerts"."failing_since", NOW()),
           "last_alerted_at" = CASE
             WHEN "water_ops_alerts"."last_alerted_at" IS NULL
               OR "water_ops_alerts"."last_alerted_at" < NOW() - $2::interval THEN NOW()
             ELSE "water_ops_alerts"."last_alerted_at"
           END
         RETURNING "failing_since" AS "failingSince",
                   ("last_alerted_at" = NOW()) AS "alerted",
                   ("failing_since" = NOW()) AS "first"`,
      [key, remindAfter],
    );
    const row = rows[0];
    if (!row?.alerted) return null;
    return {
      kind: row.first ? "first" : "reminder",
      failingSince: row.failingSince,
    };
  }

  /**
   * Record that `key` works again. Returns when its failure started if it was
   * failing *and* the team was told about it (so exactly one caller emails
   * "recovered"); a failure that was never alerted recovers silently.
   */
  async recordRecovery(key: string): Promise<Date | null> {
    // TypeORM's Postgres driver returns [rows, rowCount] for UPDATE.
    const [rows]: [Array<{ failingSince: Date; alerted: boolean }>, number] =
      await this.manager.query(
        `UPDATE "water_ops_alerts" a SET "failing_since" = NULL
         FROM (
           SELECT "id", "failing_since", "last_alerted_at" FROM "water_ops_alerts"
           WHERE "key" = $1 AND "failing_since" IS NOT NULL
           FOR UPDATE
         ) prev
         WHERE a."id" = prev."id"
         RETURNING prev."failing_since" AS "failingSince",
                   (prev."last_alerted_at" >= prev."failing_since") AS "alerted"`,
        [key],
      );
    const row = rows[0];
    return row?.alerted ? row.failingSince : null;
  }

  /** Forget claims whose email failed, so the next run reports them again. */
  async releaseClaims(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.manager.query(
      `DELETE FROM "water_ops_alerts" WHERE "key" = ANY($1::text[])`,
      [keys],
    );
  }

  /** Record one-off signals; returns the keys not recorded before. */
  async claimNew(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows: Array<{ key: string }> = await this.manager.query(
      `INSERT INTO "water_ops_alerts" ("key", "last_alerted_at")
       SELECT k, NOW() FROM unnest($1::text[]) AS k
       ON CONFLICT ("key") DO NOTHING
       RETURNING "key"`,
      [keys],
    );
    return rows.map((r) => r.key);
  }
}
