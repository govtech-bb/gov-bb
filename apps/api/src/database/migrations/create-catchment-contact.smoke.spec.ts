import { DataSource } from "typeorm";
import { CreateCatchmentContact1785500000000 } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "CreateCatchmentContact migration (smoke)",
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

    it("up creates catchment_contact with a unique catchment_name and seeds one row per serving catchment", async () => {
      const queryRunner = dataSource.createQueryRunner();
      const migration = new CreateCatchmentContact1785500000000();

      // Everything runs inside a transaction we ALWAYS roll back: Postgres DDL
      // is transactional, so the developer's real table and rows are left
      // exactly as found. Without it, down()'s raw DROP would take the live
      // local table while TypeORM still records the migration as applied — the
      // API would boot, see nothing pending, and never recreate it.
      await queryRunner.startTransaction();
      try {
        await queryRunner.query(`DROP TABLE IF EXISTS "catchment_contact"`);
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await migration.up(queryRunner);

        const cols = await queryRunner.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = 'catchment_contact'`,
        );
        const byName = Object.fromEntries(
          cols.map((c: { column_name: string }) => [c.column_name, c]),
        );
        expect(byName.catchment_name).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });
        expect(byName.mda_email).toMatchObject({
          data_type: "character varying",
          is_nullable: "NO",
        });

        // Unique on catchment_name: one inbox per serving catchment, so a
        // second row can never make the send-time lookup ambiguous.
        const uniq = await queryRunner.query(
          `SELECT indexdef FROM pg_indexes
           WHERE tablename = 'catchment_contact'
             AND indexname = 'ix_catchment_contact_catchment_name'`,
        );
        expect(uniq).toHaveLength(1);
        expect(uniq[0].indexdef).toContain("UNIQUE");

        // Seeded with the seven serving catchments, all on the shared test
        // inbox — identical behaviour to the hardcoded map it replaces. Real
        // Ministry addresses are an UPDATE per environment, not a deploy.
        const rows = await queryRunner.query(
          `SELECT catchment_name, mda_email FROM catchment_contact
           ORDER BY catchment_name`,
        );
        expect(rows).toHaveLength(7);
        expect(
          rows.map((r: { catchment_name: string }) => r.catchment_name),
        ).toEqual([
          "Branford Taitt Polyclinic",
          "David Thompson Health & Social Services Complex",
          "Eunice Gibson Polyclinic",
          "Maurice Byer Polyclinic",
          "Randal Phillips Polyclinic",
          "Sir Winston Scott Polyclinic",
          "St. Philip Polyclinic",
        ]);
        expect(
          rows.every(
            (r: { mda_email: string }) => r.mda_email === "testing@govtech.bb",
          ),
        ).toBe(true);
        // Frederick Miller is served by St. Philip, so it gets no row of its
        // own — a row here would be an inbox nothing can ever route to.
        expect(
          rows.some((r: { catchment_name: string }) =>
            r.catchment_name.includes("Frederick Miller"),
          ),
        ).toBe(false);

        // Re-running is a no-op, not a crash: a git revert never runs down(),
        // so a re-land meets its own table and rows again (cf. the ministry_key
        // re-land, which crash-looped the API on a bare ADD COLUMN).
        await migration.up(queryRunner);
        const afterRerun = await queryRunner.query(
          `SELECT count(*)::int AS n FROM catchment_contact`,
        );
        expect(afterRerun[0].n).toBe(7);

        // An operator's real address survives a re-run — the seed must never
        // clobber what an environment has already set.
        await queryRunner.query(
          `UPDATE catchment_contact SET mda_email = $1
           WHERE catchment_name = 'St. Philip Polyclinic'`,
          ["ehd.stphilip@health.gov.bb"],
        );
        await migration.up(queryRunner);
        const kept = await queryRunner.query(
          `SELECT mda_email FROM catchment_contact
           WHERE catchment_name = 'St. Philip Polyclinic'`,
        );
        expect(kept[0].mda_email).toBe("ehd.stphilip@health.gov.bb");

        await migration.down(queryRunner);
        const gone = await queryRunner.query(
          `SELECT to_regclass('public.catchment_contact') AS exists`,
        );
        expect(gone[0].exists).toBeNull();
      } finally {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  },
);
