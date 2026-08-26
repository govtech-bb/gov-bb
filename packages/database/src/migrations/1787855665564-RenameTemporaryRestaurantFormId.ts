import { MigrationInterface, QueryRunner } from "typeorm";

const OLD_ID = "apply-for-temporary-restaurant-licence";
const NEW_ID = "apply-for-temporary-restaurant-permit";

/**
 * Carry the `apply-for-temporary-restaurant-licence` →
 * `apply-for-temporary-restaurant-permit` form-id rename through every table
 * that stores a form id.
 *
 * The recipe file and the landing page's `form_id` move in the same commit, but
 * the rows don't move with them: nothing in the schema references a form id by
 * foreign key — every table holds it as a loose `varchar(100)`. See
 * RenameHotelLicenceFormId1787682865564 for what orphaning each table actually
 * breaks; the mechanics here are identical.
 *
 * The form's `meta.visibility` is `draft`, so there is unlikely to be much
 * submission history under the old id — but `form_config` (the MDA contact link
 * behind `resolveMdaEmail`) and `service_status` are populated for it, and those
 * are exactly the rows whose silent orphaning is hardest to spot.
 */
export class RenameTemporaryRestaurantFormId1787855665564 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await rename(queryRunner, OLD_ID, NEW_ID);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await rename(queryRunner, NEW_ID, OLD_ID);
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
