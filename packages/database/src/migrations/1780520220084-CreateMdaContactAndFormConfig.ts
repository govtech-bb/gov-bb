import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMdaContactAndFormConfig1780520220084 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // mda_contact is created first: form_config carries a FK into it.
    await queryRunner.query(`
      CREATE TABLE "mda_contact" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "label" varchar(255) NOT NULL,
        "title" varchar(255) NOT NULL,
        "telephone" varchar(50) NOT NULL,
        "email" varchar(255) NOT NULL,
        "address" jsonb,
        "mda_email" varchar(255) NOT NULL
      )
    `);

    // mda_contact_id is a real column with a DB-level FK. ON DELETE SET NULL:
    // deleting a contact nulls the reference (the config row survives) so the
    // email processor falls back to the default inbox rather than resolving a
    // stale production address. config (jsonb) is reserved for #716.
    await queryRunner.query(`
      CREATE TABLE "form_config" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "form_id" varchar(100) NOT NULL,
        "mda_contact_id" uuid,
        "config" jsonb,
        CONSTRAINT "fk_form_config_mda_contact"
          FOREIGN KEY ("mda_contact_id")
          REFERENCES "mda_contact" ("id")
          ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_form_config_form_id" ON "form_config" ("form_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // form_config first: it holds the FK into mda_contact.
    await queryRunner.query(`DROP TABLE IF EXISTS "form_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mda_contact"`);
  }
}
