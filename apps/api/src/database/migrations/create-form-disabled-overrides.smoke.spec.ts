import { DataSource } from "typeorm";
import * as path from "node:path";

const HAS_DB = !!process.env.DB_HOST;

// Resolve the migration class from disk at runtime so the test does not break
// when the filename's timestamp prefix changes between dev rebases.
function loadMigrationClass(): new () => {
  up: (qr: unknown) => Promise<void>;
  down: (qr: unknown) => Promise<void>;
} {
  const fs = require("node:fs");
  const dir = __dirname;
  const file = fs
    .readdirSync(dir)
    .find((f: string) => f.endsWith("-CreateFormDisabledOverrides.ts"));
  if (!file) {
    throw new Error(
      "Could not find CreateFormDisabledOverrides migration file",
    );
  }
  const mod = require(path.join(dir, file));
  const exportedClassName = Object.keys(mod).find((k) =>
    k.startsWith("CreateFormDisabledOverrides"),
  );
  if (!exportedClassName) {
    throw new Error(
      "Migration file does not export a CreateFormDisabledOverrides* class",
    );
  }
  return mod[exportedClassName];
}

(HAS_DB ? describe : describe.skip)(
  "CreateFormDisabledOverrides migration (smoke)",
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

    it("up creates the form_disabled_overrides table with the expected columns", async () => {
      const queryRunner = dataSource.createQueryRunner();
      const MigrationClass = loadMigrationClass();
      const migration = new MigrationClass();

      // Run every statement inside a transaction we ALWAYS roll back. Postgres
      // DDL is transactional, so on rollback the developer's real
      // form_disabled_overrides table (and its data) is left exactly as we
      // found it. Without this, the migration.down() below — a raw
      // `DROP TABLE` — would leave the table dropped against the live local DB
      // (DB_HOST is injected from apps/api/.env by nx) while TypeORM's
      // `migrations` bookkeeping still records the migration as applied. The
      // API would then boot, see nothing pending, and never recreate the table.
      await queryRunner.startTransaction();
      try {
        // Clean slate within the transaction (rolled back afterwards).
        await queryRunner.query(
          `DROP TABLE IF EXISTS "form_disabled_overrides"`,
        );

        await migration.up(queryRunner);

        const cols = await queryRunner.query(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_name = 'form_disabled_overrides'
           ORDER BY column_name`,
        );

        const byName = Object.fromEntries(
          cols.map((c: { column_name: string }) => [c.column_name, c]),
        );
        expect(byName.form_id).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(byName.reason).toMatchObject({
          data_type: "text",
          is_nullable: "NO",
        });
        expect(byName.disabled_by).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(byName.disabled_at).toMatchObject({
          data_type: "timestamp without time zone",
          is_nullable: "NO",
        });
        expect(byName.disabled_at.column_default).toMatch(/now\(\)/i);

        // Primary key check.
        const pk = await queryRunner.query(
          `SELECT a.attname AS column_name
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
           WHERE i.indrelid = 'form_disabled_overrides'::regclass AND i.indisprimary`,
        );
        expect(pk).toEqual([{ column_name: "form_id" }]);

        // down() should remove the table it created.
        await migration.down(queryRunner);
        const after = await queryRunner.query(
          `SELECT to_regclass('public.form_disabled_overrides') AS exists`,
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
