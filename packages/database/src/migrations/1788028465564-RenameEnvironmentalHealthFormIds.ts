import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Carry eight Environmental Health form-id renames through every table that
 * stores a form id:
 *
 *   barraks-lodging-environmental-health        → apply-for-lodging-barracks-licence
 *   register-hair-beauty-business               → apply-for-hair-salon-licence
 *   hairdresser-licence-application             → apply-for-hairdresser-licence
 *   funeral-directors-licence-application       → apply-for-funeral-director-licence
 *   funeral-embalmer-licence-application        → apply-for-funeral-embalmer-licence
 *   funeral-establishment-licence-application   → apply-for-funeral-establishment-licence
 *   waste-vehicle-licence-application           → apply-for-offensive-matter-licence
 *   environmental-health-offensive-trade-licence → apply-for-offensive-waste-licence
 *
 * The recipe files and the landing pages' `form_id` move in the same commit,
 * but the rows don't move with them: nothing in the schema references a form id
 * by foreign key — every table holds it as a loose `varchar(100)`. See
 * RenameHotelLicenceFormId1787682865564 for what orphaning each table actually
 * breaks; the mechanics here are identical, only the id list is longer.
 *
 * All eight forms are `meta.visibility: preview` (the barracks page is `draft`),
 * so there is unlikely to be much submission history under the old ids — but
 * `form_config` (the MDA contact link behind `resolveMdaEmail`) and
 * `service_status` are populated for them, and those are exactly the rows whose
 * silent orphaning is hardest to spot.
 */
export class RenameEnvironmentalHealthFormIds1788028465564 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [from, to] of RENAMES) {
      await rename(queryRunner, from, to);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [from, to] of RENAMES) {
      await rename(queryRunner, to, from);
    }
  }
}

/** `[oldFormId, newFormId]`, in the order the rename sheet lists them. */
const RENAMES: [string, string][] = [
  [
    "barraks-lodging-environmental-health",
    "apply-for-lodging-barracks-licence",
  ],
  ["register-hair-beauty-business", "apply-for-hair-salon-licence"],
  ["hairdresser-licence-application", "apply-for-hairdresser-licence"],
  [
    "funeral-directors-licence-application",
    "apply-for-funeral-director-licence",
  ],
  [
    "funeral-embalmer-licence-application",
    "apply-for-funeral-embalmer-licence",
  ],
  [
    "funeral-establishment-licence-application",
    "apply-for-funeral-establishment-licence",
  ],
  ["waste-vehicle-licence-application", "apply-for-offensive-matter-licence"],
  [
    "environmental-health-offensive-trade-licence",
    "apply-for-offensive-waste-licence",
  ],
];

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
