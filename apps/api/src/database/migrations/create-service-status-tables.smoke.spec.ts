import { DataSource } from "typeorm";
import { CreateServiceStatusTables1783356461699 } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "CreateServiceStatusTables migration (smoke)",
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

    it("up creates service_status and service_status_audit_log with the expected schema", async () => {
      const queryRunner = dataSource.createQueryRunner();
      const migration = new CreateServiceStatusTables1783356461699();

      // Run every statement inside a transaction we ALWAYS roll back. Postgres
      // DDL is transactional, so on rollback the developer's real tables (and
      // data) are left exactly as we found them.
      await queryRunner.startTransaction();
      try {
        // Clean slate within the transaction (rolled back afterwards).
        await queryRunner.query(
          `DROP TABLE IF EXISTS "service_status_audit_log"`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "service_status"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "service_status_enum"`);
        // uuid_generate_v4() default needs the extension; harmless if present.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await migration.up(queryRunner);

        // The shared enum type carries exactly the three states, in order.
        const enumValues = await queryRunner.query(
          `SELECT e.enumlabel FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'service_status_enum'
           ORDER BY e.enumsortorder`,
        );
        expect(
          enumValues.map((v: { enumlabel: string }) => v.enumlabel),
        ).toEqual(["enabled", "form_disabled", "disabled"]);

        const statusCols = await queryRunner.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = $1
           ORDER BY column_name`,
          ["service_status"],
        );
        const statusByName = Object.fromEntries(
          statusCols.map((c: { column_name: string }) => [c.column_name, c]),
        );

        expect(statusByName.id).toMatchObject({
          data_type: "uuid",
          is_nullable: "NO",
        });
        expect(statusByName.form_id).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(statusByName.status).toMatchObject({
          data_type: "USER-DEFINED",
          is_nullable: "NO",
        });

        // A row created without an explicit status defaults to 'enabled'.
        await queryRunner.query(
          `INSERT INTO "service_status" ("form_id") VALUES ('demo-form')`,
        );
        const defaulted = await queryRunner.query(
          `SELECT status FROM "service_status" WHERE form_id = 'demo-form'`,
        );
        expect(defaulted[0].status).toBe("enabled");

        // The unique index must reject a second status row for the same form.
        // The violation aborts the surrounding transaction, so isolate the
        // failing insert behind a savepoint.
        await queryRunner.query(`SAVEPOINT dup_check`);
        await expect(
          queryRunner.query(
            `INSERT INTO "service_status" ("form_id", "status")
             VALUES ('demo-form', 'disabled')`,
          ),
        ).rejects.toThrow();
        await queryRunner.query(`ROLLBACK TO SAVEPOINT dup_check`);

        const auditCols = await queryRunner.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = $1
           ORDER BY column_name`,
          ["service_status_audit_log"],
        );
        const auditByName = Object.fromEntries(
          auditCols.map((c: { column_name: string }) => [c.column_name, c]),
        );

        expect(auditByName.id).toMatchObject({
          data_type: "uuid",
          is_nullable: "NO",
        });
        expect(auditByName.form_id).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        // Nullable: a form's first-ever entry has no previous state.
        expect(auditByName.old_state).toMatchObject({
          data_type: "USER-DEFINED",
          is_nullable: "YES",
        });
        expect(auditByName.new_state).toMatchObject({
          data_type: "USER-DEFINED",
          is_nullable: "NO",
        });
        expect(auditByName.author).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(auditByName.changed_at).toMatchObject({
          data_type: "timestamp without time zone",
          is_nullable: "NO",
        });

        // First-ever entry: NULL old_state accepted, changed_at defaults.
        await queryRunner.query(
          `INSERT INTO "service_status_audit_log" ("form_id", "new_state", "author")
           VALUES ('demo-form', 'enabled', 'someone@govtech.bb')`,
        );
        const firstEntry = await queryRunner.query(
          `SELECT old_state, changed_at FROM "service_status_audit_log"
           WHERE form_id = 'demo-form'`,
        );
        expect(firstEntry).toHaveLength(1);
        expect(firstEntry[0].old_state).toBeNull();
        expect(firstEntry[0].changed_at).toBeInstanceOf(Date);

        // The log is append-only history: a second entry for the same form
        // must be accepted (index on form_id is non-unique).
        await queryRunner.query(
          `INSERT INTO "service_status_audit_log"
             ("form_id", "old_state", "new_state", "author")
           VALUES ('demo-form', 'enabled', 'form_disabled', 'someone@govtech.bb')`,
        );
        const history = await queryRunner.query(
          `SELECT id FROM "service_status_audit_log" WHERE form_id = 'demo-form'`,
        );
        expect(history).toHaveLength(2);

        const indexes = await queryRunner.query(
          `SELECT indexname FROM pg_indexes
           WHERE indexname IN
             ('ix_service_status_form_id', 'ix_service_status_audit_log_form_id')`,
        );
        expect(indexes).toHaveLength(2);

        // Clear the seeded rows so down() drops tables it owns cleanly.
        await queryRunner.query(`DELETE FROM "service_status_audit_log"`);
        await queryRunner.query(`DELETE FROM "service_status"`);

        // down() removes both tables and the enum type it created.
        await migration.down(queryRunner);
        const after = await queryRunner.query(
          `SELECT to_regclass('public.service_status') AS status_table,
                  to_regclass('public.service_status_audit_log') AS audit_table`,
        );
        expect(after[0].status_table).toBeNull();
        expect(after[0].audit_table).toBeNull();
        const typeAfter = await queryRunner.query(
          `SELECT 1 FROM pg_type WHERE typname = 'service_status_enum'`,
        );
        expect(typeAfter).toHaveLength(0);
      } finally {
        // Discard everything above — the live database is never mutated.
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  },
);
