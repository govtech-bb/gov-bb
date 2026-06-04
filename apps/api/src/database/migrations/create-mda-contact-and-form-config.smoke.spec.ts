import { DataSource } from "typeorm";
import { CreateMdaContactAndFormConfig1780520220084 } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "CreateMdaContactAndFormConfig migration (smoke)",
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

    it("up creates mda_contact + form_config with the expected schema, FK, and unique index", async () => {
      const queryRunner = dataSource.createQueryRunner();
      const migration = new CreateMdaContactAndFormConfig1780520220084();

      // Run every statement inside a transaction we ALWAYS roll back. Postgres
      // DDL is transactional, so on rollback the developer's real tables (and
      // data) are left exactly as we found them. Without this, the
      // migration.down() below — raw `DROP TABLE`s — would drop the live local
      // tables (DB_HOST is injected from apps/api/.env by nx) while TypeORM's
      // `migrations` bookkeeping still records the migration as applied. The
      // API would then boot, see nothing pending, and never recreate them.
      await queryRunner.startTransaction();
      try {
        // Clean slate within the transaction (rolled back afterwards). Drop
        // form_config first — it holds the FK into mda_contact.
        await queryRunner.query(`DROP TABLE IF EXISTS "form_config"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "mda_contact"`);
        // uuid_generate_v4() default needs the extension; harmless if present.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await migration.up(queryRunner);

        const columnsOf = async (table: string) => {
          const cols = await queryRunner.query(
            `SELECT column_name, data_type, is_nullable
             FROM information_schema.columns
             WHERE table_name = $1
             ORDER BY column_name`,
            [table],
          );
          return Object.fromEntries(
            cols.map((c: { column_name: string }) => [c.column_name, c]),
          );
        };

        // --- mda_contact ---
        const contact = await columnsOf("mda_contact");
        expect(contact.label).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(contact.title).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(contact.telephone).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(contact.email).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(contact.address).toMatchObject({
          data_type: "jsonb",
          is_nullable: "YES",
        });
        // The private notification recipient — required on the directory row.
        expect(contact.mda_email).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });

        // --- form_config ---
        const config = await columnsOf("form_config");
        expect(config.form_id).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(config.mda_contact_id).toMatchObject({
          data_type: "uuid",
          is_nullable: "YES",
        });
        expect(config.config).toMatchObject({
          data_type: "jsonb",
          is_nullable: "YES",
        });

        // Unique index on form_id (one config row per form).
        const uniq = await queryRunner.query(
          `SELECT indexname FROM pg_indexes
           WHERE tablename = 'form_config' AND indexname = 'ix_form_config_form_id'`,
        );
        expect(uniq).toHaveLength(1);

        // FK from form_config.mda_contact_id → mda_contact.id, ON DELETE SET
        // NULL (confdeltype 'n') so a deleted contact never leaves a dangling
        // reference resolving to a stale production address.
        const fk = await queryRunner.query(
          `SELECT confdeltype FROM pg_constraint
           WHERE conname = 'fk_form_config_mda_contact'`,
        );
        expect(fk).toEqual([{ confdeltype: "n" }]);

        // down() removes both tables it created.
        await migration.down(queryRunner);
        const contactAfter = await queryRunner.query(
          `SELECT to_regclass('public.mda_contact') AS exists`,
        );
        const configAfter = await queryRunner.query(
          `SELECT to_regclass('public.form_config') AS exists`,
        );
        expect(contactAfter[0].exists).toBeNull();
        expect(configAfter[0].exists).toBeNull();
      } finally {
        // Discard everything above — the live database is never mutated.
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  },
);
