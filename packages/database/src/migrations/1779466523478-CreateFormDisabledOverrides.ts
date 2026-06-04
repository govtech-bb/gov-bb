import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFormDisabledOverrides1779466523478 implements MigrationInterface {
  name = "CreateFormDisabledOverrides1779466523478";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "form_disabled_overrides" (
        "form_id" character varying(100) NOT NULL,
        "reason" text NOT NULL,
        "disabled_by" character varying(255) NOT NULL,
        "disabled_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_form_disabled_overrides" PRIMARY KEY ("form_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "form_disabled_overrides"`);
  }
}
