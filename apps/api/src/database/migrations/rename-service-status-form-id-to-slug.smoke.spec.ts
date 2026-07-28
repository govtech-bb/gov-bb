import { DataSource, type QueryRunner } from "typeorm";
import {
  CreateServiceStatusTables1783356461699,
  RenameServiceStatusFormIdToSlug1783440984875,
} from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "RenameServiceStatusFormIdToSlug migration (smoke)",
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

    const columnNames = (queryRunner: QueryRunner, table: string) =>
      queryRunner
        .query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table],
        )
        .then((rows: { column_name: string }[]) =>
          rows.map((r) => r.column_name),
        );

    it("renames form_id -> slug (column + index) on both tables and back", async () => {
      const queryRunner = dataSource.createQueryRunner();
      const create = new CreateServiceStatusTables1783356461699();
      const rename = new RenameServiceStatusFormIdToSlug1783440984875();

      // Everything runs inside a transaction we ALWAYS roll back — Postgres DDL
      // is transactional, so the developer's real tables are left untouched.
      await queryRunner.startTransaction();
      try {
        await queryRunner.query(
          `DROP TABLE IF EXISTS "service_status_audit_log"`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "service_status"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "service_status_enum"`);
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await create.up(queryRunner);
        await rename.up(queryRunner);

        // Column renamed on both tables.
        expect(await columnNames(queryRunner, "service_status")).toContain(
          "slug",
        );
        expect(await columnNames(queryRunner, "service_status")).not.toContain(
          "form_id",
        );
        expect(
          await columnNames(queryRunner, "service_status_audit_log"),
        ).toContain("slug");

        // Indexes renamed, old names gone.
        const indexes = await queryRunner.query(
          `SELECT indexname FROM pg_indexes
           WHERE indexname IN
             ('ix_service_status_slug', 'ix_service_status_audit_log_slug',
              'ix_service_status_form_id', 'ix_service_status_audit_log_form_id')`,
        );
        const names = indexes.map((i: { indexname: string }) => i.indexname);
        expect(names).toEqual(
          expect.arrayContaining([
            "ix_service_status_slug",
            "ix_service_status_audit_log_slug",
          ]),
        );
        expect(names).not.toContain("ix_service_status_form_id");

        // The unique index still guards one row per slug.
        await queryRunner.query(
          `INSERT INTO "service_status" ("slug") VALUES ('demo-service')`,
        );
        await queryRunner.query(`SAVEPOINT dup_check`);
        await expect(
          queryRunner.query(
            `INSERT INTO "service_status" ("slug", "status")
             VALUES ('demo-service', 'disabled')`,
          ),
        ).rejects.toThrow();
        await queryRunner.query(`ROLLBACK TO SAVEPOINT dup_check`);
        await queryRunner.query(`DELETE FROM "service_status"`);

        // down() restores form_id.
        await rename.down(queryRunner);
        expect(await columnNames(queryRunner, "service_status")).toContain(
          "form_id",
        );
        expect(await columnNames(queryRunner, "service_status")).not.toContain(
          "slug",
        );

        await create.down(queryRunner);
      } finally {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  },
);
