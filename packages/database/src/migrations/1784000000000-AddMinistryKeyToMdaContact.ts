import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `ministry_key` to `mda_contact` — the stable key tying an MDA to its CMS
 * webhook destination (#1920/#2020). Nullable: only MDAs that sync to a
 * case-management system carry one. It is the lookup key into the
 * `MDA_WEBHOOK_DESTINATIONS` JSON secret; `resolveWebhookDestination(formId)`
 * walks `form_config → mda_contact.ministry_key → MDA_WEBHOOK_DESTINATIONS[key]`.
 *
 * Values are seeded per environment out of band (engineers/ops), alongside the
 * matching JSON secret entry — see docs/decisions/0064-per-mda-webhook-destinations.md.
 */
export class AddMinistryKeyToMdaContact1784000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mda_contact" ADD COLUMN "ministry_key" varchar(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mda_contact" DROP COLUMN IF EXISTS "ministry_key"`,
    );
  }
}
