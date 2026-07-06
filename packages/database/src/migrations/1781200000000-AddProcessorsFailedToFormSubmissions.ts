import { MigrationInterface, QueryRunner } from "typeorm";

// Nullable, no backfill: existing rows stay NULL ("all dispatched / none ran"),
// which is the same meaning the dispatch loop assigns on success (#1747).
export class AddProcessorsFailedToFormSubmissions1781200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ADD "processors_failed" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" DROP COLUMN "processors_failed"`,
    );
  }
}
