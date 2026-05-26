import { MigrationInterface, QueryRunner } from "typeorm";

// Safe in sandbox/dev (form_submissions is empty/short-lived). On a
// production table with significant row counts, the unbounded UPDATE
// + ALTER NOT NULL + ADD UNIQUE will hold AccessExclusiveLock for the
// duration — chunk the backfill and create the index CONCURRENTLY before
// running this against prod.
export class AddReferenceCodeToFormSubmissions1778841559000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ADD "reference_code" character varying(64)`,
    );

    // Backfill: leading `LEGACY-` so these codes can never collide with
    // the runtime format `<PREFIX>-YYYYMMDD-HHMMSS-RANDOM6`. Carries the
    // form_id-derived prefix and the id's first 8 hex chars for traceability.
    await queryRunner.query(`
      UPDATE "form_submissions"
      SET "reference_code" =
        'LEGACY-'
        || COALESCE(
          NULLIF(
            UPPER(
              REGEXP_REPLACE(
                REGEXP_REPLACE(form_id, '(^|-)([a-zA-Z0-9])[^-]*', '\\2', 'g'),
                '[^A-Z0-9]',
                '',
                'g'
              )
            ),
            ''
          ),
          'X'
        )
        || '-'
        || UPPER(SUBSTR(REPLACE(id::text, '-', ''), 1, 8))
      WHERE "reference_code" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "form_submissions" ALTER COLUMN "reference_code" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ADD CONSTRAINT "UQ_form_submissions_reference_code" UNIQUE ("reference_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" DROP CONSTRAINT "UQ_form_submissions_reference_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_submissions" DROP COLUMN "reference_code"`,
    );
  }
}
