import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFormsTables1774544962999 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "form_components" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(100) NOT NULL, "version" character varying(20) NOT NULL, "schema" jsonb NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(), CONSTRAINT "UQ_9dc9f3531037f292e904975892c" UNIQUE ("key", "version"), CONSTRAINT "PK_4fa78917422bd86e5ddd4796707" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "form_definitions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" character varying(100) NOT NULL, "version" character varying(20) NOT NULL, "schema" jsonb NOT NULL, "published_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(), CONSTRAINT "PK_e7b46c89a49ab24f30618b410d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."form_submissions_status_enum" AS ENUM('draft', 'submitted', 'processing', 'complete', 'error')`,
    );
    await queryRunner.query(
      `CREATE TABLE "form_submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "form_id" character varying(100) NOT NULL, "form_version" character varying(20) NOT NULL, "status" "public"."form_submissions_status_enum" NOT NULL, "values" jsonb NOT NULL, "meta" jsonb, "submitted_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(), CONSTRAINT "PK_fb6e1e9f26cda31c358a8a1530e" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "form_submissions"`);
    await queryRunner.query(
      `DROP TYPE "public"."form_submissions_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "form_definitions"`);
    await queryRunner.query(`DROP TABLE "form_components"`);
  }
}
