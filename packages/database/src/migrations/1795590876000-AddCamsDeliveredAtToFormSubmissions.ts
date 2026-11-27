import { MigrationInterface, QueryRunner } from "typeorm";

// When CaMS accepted the case hand-off (#3714). Existing submissions are
// stamped with their submit time, so they keep the "received" the status
// lookup gave them before: most were delivered, and nothing records which
// hand-offs failed in the past. Only submissions from here on can answer
// "sending" while their hand-off is pending or has failed.
export class AddCamsDeliveredAtToFormSubmissions1795590876000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ADD "cams_delivered_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `UPDATE "form_submissions" SET "cams_delivered_at" = "submitted_at" WHERE "submitted_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" DROP COLUMN "cams_delivered_at"`,
    );
  }
}
