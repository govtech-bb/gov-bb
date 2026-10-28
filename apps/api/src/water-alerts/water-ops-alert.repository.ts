import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { WaterOpsAlertEntity } from "@govtech-bb/database";
import { BaseRepository } from "../database/base.repository";

/** A failure the caller should email about now. */
export interface FailureAlert {
  /** "first" when no email has gone out for this failure yet. */
  kind: "first" | "reminder";
  failingSince: Date;
  /**
   * last_alerted_at before this alert claimed it, for forgetAlert to put back
   * if the email isn't delivered. Postgres text, so it round-trips at full
   * (microsecond) precision: a JS Date would truncate it to milliseconds and
   * could land it just before failing_since.
   */
  previousAlertedAt: string | null;
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
   *
   * The decision reads the row as it was (`prev`, locked FOR UPDATE, as in
   * recordRecovery), because RETURNING only shows the new values: "first"
   * means no alert has gone out since this failure started. NOW() is fixed
   * per transaction, so "alerted" means this statement moved last_alerted_at.
   */
  async recordFailure(
    key: string,
    remindAfter: string,
  ): Promise<FailureAlert | null> {
    // Make sure there is a row to lock; a concurrent insert is a no-op.
    await this.manager.query(
      `INSERT INTO "water_ops_alerts" ("key") VALUES ($1)
       ON CONFLICT ("key") DO NOTHING`,
      [key],
    );
    // TypeORM's Postgres driver returns [rows, rowCount] for UPDATE.
    const [rows]: [
      Array<{
        failingSince: Date;
        alerted: boolean;
        first: boolean;
        previousAlertedAt: string | null;
      }>,
      number,
    ] = await this.manager.query(
      `UPDATE "water_ops_alerts" a SET
         "failing_since" = COALESCE(prev."failing_since", NOW()),
         "last_alerted_at" = CASE
           WHEN prev."last_alerted_at" IS NULL
             OR prev."last_alerted_at" < NOW() - $2::interval THEN NOW()
           ELSE prev."last_alerted_at"
         END
       FROM (
         SELECT "id", "failing_since", "last_alerted_at" FROM "water_ops_alerts"
         WHERE "key" = $1
         FOR UPDATE
       ) prev
       WHERE a."id" = prev."id"
       RETURNING a."failing_since" AS "failingSince",
                 (a."last_alerted_at" = NOW()) AS "alerted",
                 (prev."last_alerted_at" IS NULL
                   OR prev."last_alerted_at" < a."failing_since") AS "first",
                 prev."last_alerted_at"::text AS "previousAlertedAt"`,
      [key, remindAfter],
    );
    const row = rows[0];
    if (!row?.alerted) return null;
    return {
      kind: row.first ? "first" : "reminder",
      failingSince: row.failingSince,
      previousAlertedAt: row.previousAlertedAt,
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

  /**
   * Mark `key` healthy without a recovery. For when the failure simply no
   * longer applies (e.g. the failed sends belonged to a notice that ended),
   * so a later failure starts fresh instead of "failing since weeks ago".
   */
  async markHealthy(key: string): Promise<void> {
    await this.manager.query(
      `UPDATE "water_ops_alerts" SET "failing_since" = NULL WHERE "key" = $1`,
      [key],
    );
  }

  /**
   * Undo an alert whose email didn't go out, by putting last_alerted_at back
   * to `previousAlertedAt` (from recordFailure). The next run alerts again,
   * since that value is past the interval. A recovery before then emails only
   * if an earlier alert for this failure did reach ops.
   */
  async forgetAlert(
    key: string,
    previousAlertedAt: string | null,
  ): Promise<void> {
    await this.manager.query(
      `UPDATE "water_ops_alerts" SET "last_alerted_at" = $2::timestamp
       WHERE "key" = $1`,
      [key, previousAlertedAt],
    );
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
