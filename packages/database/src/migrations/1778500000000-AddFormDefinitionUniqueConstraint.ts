import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFormDefinitionUniqueConstraint1778500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration lived in packages/database before the package became the
    // single migration source for apps/api (#721), so it may run for the
    // first time against long-lived databases. Pre-check for existing
    // (form_id, version) duplicates and fail with an actionable error naming
    // the offending rows instead of a bare unique-constraint violation.
    const duplicates: { form_id: string; version: string; count: string }[] =
      await queryRunner.query(`
        SELECT "form_id", "version", COUNT(*) AS count
        FROM "form_definitions"
        GROUP BY "form_id", "version"
        HAVING COUNT(*) > 1
      `);
    if (duplicates.length > 0) {
      const rows = duplicates
        .map(
          (d) =>
            `(form_id=${d.form_id}, version=${d.version}, rows=${d.count})`,
        )
        .join(", ");
      throw new Error(
        `Cannot add unique constraint "UQ_form_definitions_form_id_version": ` +
          `form_definitions contains duplicate (form_id, version) pairs: ${rows}. ` +
          `Deduplicate these rows, then re-run migrations.`,
      );
    }

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
