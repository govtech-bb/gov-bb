import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFormEditingSessions1780924594196 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // One editing claim per form: the unique index on form_id is what makes the
    // conditional upsert atomic (insert-if-absent races resolve to a single
    // winner; the loser sees the existing fresh holder and goes read-only).
    await queryRunner.query(`
      CREATE TABLE "form_editing_session" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "form_id" varchar(100) NOT NULL,
        "user_login" varchar(255) NOT NULL,
        "claimed_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "last_activity_at" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_form_editing_session_form_id" ON "form_editing_session" ("form_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "form_editing_session"`);
  }
}
