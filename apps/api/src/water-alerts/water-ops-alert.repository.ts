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
   * Record that `key` is failing. Returns the alert to send when the failure
   * is new, or when the last alert is older than `remindAfter` (a Postgres
   * interval, e.g. "6 hours"); otherwise null. NOW() is fixed per statement,
   * so a new failure has failing_since = last_alerted_at.
   */
  async recordFailure(
    key: string,
    remindAfter: string,
  ): Promise<FailureAlert | null> {
    const rows: Array<{ failingSince: Date; first: boolean }> =
      await this.manager.query(
        `INSERT INTO "water_ops_alerts" ("key", "failing_since", "last_alerted_at")
         VALUES ($1, NOW(), NOW())
         ON CONFLICT ("key") DO UPDATE SET
           "failing_since" = COALESCE("water_ops_alerts"."failing_since", NOW()),
           "last_alerted_at" = NOW()
         WHERE "water_ops_alerts"."failing_since" IS NULL
            OR "water_ops_alerts"."last_alerted_at" < NOW() - $2::interval
         RETURNING "failing_since" AS "failingSince",
                   ("failing_since" = "last_alerted_at") AS "first"`,
        [key, remindAfter],
      );
    const row = rows[0];
    if (!row) return null;
    return {
      kind: row.first ? "first" : "reminder",
      failingSince: row.failingSince,
    };
  }

  /**
   * Record that `key` works again. Returns when its failure started if it was
   * failing (so exactly one caller emails "recovered"), otherwise null.
   */
  async recordRecovery(key: string): Promise<Date | null> {
    // TypeORM's Postgres driver returns [rows, rowCount] for UPDATE.
    const [rows]: [Array<{ failingSince: Date }>, number] =
      await this.manager.query(
        `UPDATE "water_ops_alerts" a SET "failing_since" = NULL
         FROM (
           SELECT "id", "failing_since" FROM "water_ops_alerts"
           WHERE "key" = $1 AND "failing_since" IS NOT NULL
           FOR UPDATE
         ) prev
         WHERE a."id" = prev."id"
         RETURNING prev."failing_since" AS "failingSince"`,
        [key],
      );
    return rows[0]?.failingSince ?? null;
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
