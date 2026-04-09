import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomComponents1775061357620 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "custom_components" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "namespace" character varying(100) NOT NULL,
        "type" character varying(100) NOT NULL,
        "definition" jsonb NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_custom_components" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "custom_components"`);
  }
}
