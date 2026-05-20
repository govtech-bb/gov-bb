import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFormDefinitionUniqueConstraint1778500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_definitions" ADD CONSTRAINT "UQ_form_definitions_form_id_version" UNIQUE ("form_id", "version")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_definitions" DROP CONSTRAINT "UQ_form_definitions_form_id_version"`,
    );
  }
}
