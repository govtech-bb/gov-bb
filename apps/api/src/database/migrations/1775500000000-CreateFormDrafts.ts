import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFormDrafts1775500000000 implements MigrationInterface {
  name = "CreateFormDrafts1775500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."form_drafts_status_enum" AS ENUM('active', 'abandoned')`,
    );
    await queryRunner.query(`
      CREATE TABLE "form_drafts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "draft_id" character varying(100) NOT NULL,
        "form_id" character varying(100) NOT NULL,
        "form_version" character varying(20) NOT NULL,
        "values" jsonb NOT NULL DEFAULT '{}',
        "last_active_page" integer NOT NULL DEFAULT 0,
        "status" "public"."form_drafts_status_enum" NOT NULL DEFAULT 'active',
        "last_active_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "UQ_form_drafts_draft_id" UNIQUE ("draft_id"),
        CONSTRAINT "PK_form_drafts" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "form_drafts"`);
    await queryRunner.query(`DROP TYPE "public"."form_drafts_status_enum"`);
  }
}
