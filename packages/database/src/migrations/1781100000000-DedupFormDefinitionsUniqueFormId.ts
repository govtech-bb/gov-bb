import { MigrationInterface, QueryRunner } from "typeorm";

// #1196 (PR B — cutover, "M2"). Recipe versioning is retired: the builder DB
// scratch space becomes one row per form. This collapses any per-version rows
// to the single highest-semver row, swaps UNIQUE(form_id, version) →
// UNIQUE(form_id), and makes `version` nullable (versionless drafts persist
// NULL; the column is kept as a Phase-2 audit breadcrumb).
//
// Runs in TypeORM's per-migration transaction, so any anomaly aborts the whole
// migration (the new code never serves). Run the per-environment duplicate
// audit before deploying — same precaution as #758:
//   SELECT form_id, count(*) FROM form_definitions GROUP BY form_id HAVING count(*) > 1;
export class DedupFormDefinitionsUniqueFormId1781100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep the highest-semver row per form_id (created_at breaks ties), delete
    // the rest. string_to_array(version,'.')::int[] sorts numerically so
    // "1.10.0" > "1.9.0" (a naive text MAX would get this wrong).
    await queryRunner.query(`
      DELETE FROM "form_definitions" a
      USING (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY form_id
            ORDER BY string_to_array(version, '.')::int[] DESC NULLS LAST,
                     created_at DESC
          ) AS rn
        FROM "form_definitions"
      ) ranked
      WHERE a.id = ranked.id AND ranked.rn > 1
    `);

    await queryRunner.query(
      `ALTER TABLE "form_definitions" DROP CONSTRAINT "UQ_form_definitions_form_id_version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_definitions" ALTER COLUMN "version" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_definitions" ADD CONSTRAINT "UQ_form_definitions_form_id" UNIQUE ("form_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The dedup DELETE is not reversible — the per-version rows are gone. This
    // restores the schema (constraint + NOT NULL); SET NOT NULL fails if any
    // versionless rows were written after the cutover, which is correct (a
    // rollback must also revert the code that writes NULL).
    await queryRunner.query(
      `ALTER TABLE "form_definitions" DROP CONSTRAINT "UQ_form_definitions_form_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_definitions" ALTER COLUMN "version" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_definitions" ADD CONSTRAINT "UQ_form_definitions_form_id_version" UNIQUE ("form_id", "version")`,
    );
  }
}
