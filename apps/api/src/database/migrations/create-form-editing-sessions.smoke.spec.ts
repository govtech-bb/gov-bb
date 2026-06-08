import { DataSource } from "typeorm";
import { CreateFormEditingSessions1780924594196 } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "CreateFormEditingSessions migration (smoke)",
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

    it("up creates form_editing_session with the expected schema and unique index on form_id", async () => {
      const queryRunner = dataSource.createQueryRunner();
      const migration = new CreateFormEditingSessions1780924594196();

      // Run every statement inside a transaction we ALWAYS roll back. Postgres
      // DDL is transactional, so on rollback the developer's real tables (and
      // data) are left exactly as we found them. Without this, the
      // migration.down() below — a raw `DROP TABLE` — would drop the live local
      // table (DB_HOST is injected from apps/api/.env by nx) while TypeORM's
      // `migrations` bookkeeping still records the migration as applied. The
      // API would then boot, see nothing pending, and never recreate it.
      await queryRunner.startTransaction();
      try {
        // Clean slate within the transaction (rolled back afterwards).
        await queryRunner.query(`DROP TABLE IF EXISTS "form_editing_session"`);
        // uuid_generate_v4() default needs the extension; harmless if present.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await migration.up(queryRunner);

        const cols = await queryRunner.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = $1
           ORDER BY column_name`,
          ["form_editing_session"],
        );
        const byName = Object.fromEntries(
          cols.map((c: { column_name: string }) => [c.column_name, c]),
        );

        expect(byName.form_id).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(byName.user_login).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(byName.claimed_at).toMatchObject({
          data_type: "timestamp without time zone",
          is_nullable: "NO",
        });
        expect(byName.last_activity_at).toMatchObject({
          data_type: "timestamp without time zone",
          is_nullable: "NO",
        });

        // Unique index on form_id — one editing claim per form.
        const uniq = await queryRunner.query(
          `SELECT indexname FROM pg_indexes
           WHERE tablename = 'form_editing_session'
             AND indexname = 'ix_form_editing_session_form_id'`,
        );
        expect(uniq).toHaveLength(1);

        // The unique index must actually reject a second row for the same form.
        // The violation aborts the surrounding transaction, so isolate the
        // failing insert behind a savepoint and roll back to it to keep the
        // outer transaction usable for the down() assertions below.
        await queryRunner.query(
          `INSERT INTO "form_editing_session" ("form_id", "user_login")
           VALUES ('demo-form', 'alice')`,
        );
        await queryRunner.query(`SAVEPOINT dup_check`);
        await expect(
          queryRunner.query(
            `INSERT INTO "form_editing_session" ("form_id", "user_login")
             VALUES ('demo-form', 'bob')`,
          ),
        ).rejects.toThrow();
        await queryRunner.query(`ROLLBACK TO SAVEPOINT dup_check`);
        // Clear the seeded row so down() drops a table it owns cleanly.
        await queryRunner.query(`DELETE FROM "form_editing_session"`);

        // down() removes the table it created.
        await migration.down(queryRunner);
        const after = await queryRunner.query(
          `SELECT to_regclass('public.form_editing_session') AS exists`,
        );
        expect(after[0].exists).toBeNull();
      } finally {
        // Discard everything above — the live database is never mutated.
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  },
);
