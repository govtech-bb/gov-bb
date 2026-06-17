import { MigrationInterface, QueryRunner } from "typeorm";

// #1196 (PR A — backward-compatible groundwork). Recipe versioning is being
// retired; new submissions/drafts that resolve the canonical recipe carry no
// pinned version, so `form_version` must accept NULL. Forward-compatible and
// safe to leave in place even if the PR B cutover slips — nothing yet writes a
// NULL until that PR ships.
//
// down() restores NOT NULL. It will fail if any NULL rows already exist (i.e.
// after PR B has shipped); that is correct — a column with NULLs cannot be made
// NOT NULL without a backfill, and there is no meaningful version to backfill.
export class MakeFormVersionNullable1781000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ALTER COLUMN "form_version" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_drafts" ALTER COLUMN "form_version" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ALTER COLUMN "form_version" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_drafts" ALTER COLUMN "form_version" SET NOT NULL`,
    );
  }
}
