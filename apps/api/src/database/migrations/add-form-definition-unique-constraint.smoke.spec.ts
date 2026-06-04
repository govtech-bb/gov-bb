import { DataSource } from "typeorm";
import { AddFormDefinitionUniqueConstraint1778500000000 } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "AddFormDefinitionUniqueConstraint migration (smoke)",
  () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = new DataSource({
        type: "postgres",
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT ?? "5432", 10),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [],
        synchronize: false,
      });
      await dataSource.initialize();
    });

    afterAll(async () => {
      if (dataSource?.isInitialized) await dataSource.destroy();
    });

    it("fails loudly on duplicate (form_id, version) rows, then succeeds once clean", async () => {
      const queryRunner = dataSource.createQueryRunner();
      const migration = new AddFormDefinitionUniqueConstraint1778500000000();

      // Run every statement inside a transaction we ALWAYS roll back, so the
      // developer's real form_definitions rows and constraint state are left
      // exactly as we found them (same pattern as the other smoke specs).
      await queryRunner.startTransaction();
      try {
        // The constraint may already be applied on this DB — drop it inside
        // the transaction so the migration's up() path is exercised, and so
        // the duplicate seed rows below can be inserted at all.
        await queryRunner.query(
          `ALTER TABLE "form_definitions" DROP CONSTRAINT IF EXISTS "UQ_form_definitions_form_id_version"`,
        );

        // Seed a duplicate (form_id, version) pair.
        await queryRunner.query(`
          INSERT INTO "form_definitions" ("form_id", "version", "schema")
          VALUES
            ('__smoke-dup-form__', '9.9.9', '{}'::jsonb),
            ('__smoke-dup-form__', '9.9.9', '{}'::jsonb)
        `);

        // up() must pre-check and throw a descriptive error naming the
        // offending rows — NOT a bare unique-constraint violation. The check
        // throws from JS (no failed SQL statement), so the transaction is
        // still usable afterwards.
        await expect(migration.up(queryRunner)).rejects.toThrow(
          /duplicate.*__smoke-dup-form__.*9\.9\.9/is,
        );

        // Clean the seeded duplicates; up() now succeeds.
        await queryRunner.query(
          `DELETE FROM "form_definitions" WHERE "form_id" = '__smoke-dup-form__'`,
        );
        await migration.up(queryRunner);

        const constraint = await queryRunner.query(
          `SELECT conname FROM pg_constraint
           WHERE conname = 'UQ_form_definitions_form_id_version'`,
        );
        expect(constraint).toHaveLength(1);

        // down() removes the constraint it created.
        await migration.down(queryRunner);
        const after = await queryRunner.query(
          `SELECT conname FROM pg_constraint
           WHERE conname = 'UQ_form_definitions_form_id_version'`,
        );
        expect(after).toHaveLength(0);
      } finally {
        // Discard everything above — the live database is never mutated.
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  },
);
