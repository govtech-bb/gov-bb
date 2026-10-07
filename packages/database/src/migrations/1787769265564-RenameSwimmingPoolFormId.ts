import { MigrationInterface, QueryRunner } from "typeorm";

const NEW_ID = "apply-for-swimming-pool-licence";

/**
 * Collapse the two swimming pool form ids onto `apply-for-swimming-pool-licence`
 * (#2507).
 *
 * The service shipped twice: `swimming-wading-pool-permit` (hand-integrated in
 * #2405) and `swimming-pool-environmental-health` (the from-scratch Form Builder
 * rebuild in #2451, which the landing page's `form_id` was pointed at in #2490).
 * Both recipe files are deleted in this commit and replaced by one, so both old
 * ids have to be carried across — the rows don't move with the files, because
 * nothing in the schema references a form id by foreign key: every table holds
 * it as a loose `varchar(100)`.
 *
 * The rename order matters. `swimming-pool-environmental-health` is the id the
 * landing page has been starting since #2490, so the live state (the MDA contact
 * link, the feature-flag row, in-flight drafts) sits under it — it moves first
 * and wins any collision on a constrained column. `swimming-wading-pool-permit`
 * follows, carrying the pre-#2490 history.
 *
 * See RenameHotelLicenceFormId1787682865564 for what orphaning each table
 * actually breaks; the mechanics here are identical, run twice.
 */
export class RenameSwimmingPoolFormId1787769265564 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await rename(queryRunner, "swimming-pool-environmental-health", NEW_ID);
    await rename(queryRunner, "swimming-wading-pool-permit", NEW_ID);
  }

  /**
   * Only the id the landing page was pointing at is put back. The two old ids
   * are indistinguishable once merged, so sending rows back to
   * `swimming-wading-pool-permit` would be a guess — and that id had no live
   * state to restore, only history.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await rename(queryRunner, NEW_ID, "swimming-pool-environmental-health");
  }
}

/** Tables holding a form id under a UNIQUE or PRIMARY KEY constraint. */
const CONSTRAINED: { table: string; column: string }[] = [
  { table: "form_definitions", column: "form_id" },
  { table: "form_config", column: "form_id" },
  { table: "form_disabled_overrides", column: "form_id" },
  { table: "form_editing_session", column: "form_id" },
  { table: "service_status", column: "slug" },
];

/** Tables holding a form id with no uniqueness constraint. */
const UNCONSTRAINED: { table: string; column: string }[] = [
  { table: "service_status_audit_log", column: "slug" },
  { table: "form_submissions", column: "form_id" },
  { table: "form_drafts", column: "form_id" },
  { table: "payments", column: "form_id" },
  { table: "notification_log", column: "form_id" },
];

async function rename(
  queryRunner: QueryRunner,
  from: string,
  to: string,
): Promise<void> {
  for (const { table, column } of CONSTRAINED) {
    await queryRunner.query(
      `UPDATE "${table}" SET "${column}" = $1
         WHERE "${column}" = $2
           AND NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t."${column}" = $1)`,
      [to, from],
    );
  }
  for (const { table, column } of UNCONSTRAINED) {
    await queryRunner.query(
      `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`,
      [to, from],
    );
  }
}
