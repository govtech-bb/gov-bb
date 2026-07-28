import { DataSource, QueryRunner } from "typeorm";
import { SeedServiceStatus1783520007424 } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;

// Every statement runs inside a transaction we ALWAYS roll back, so the
// developer's real service_status data is left exactly as we found it. Postgres
// DDL is transactional, so rebuilding the (post-#1897 slug-named) schema inside
// the transaction — rather than relying on whatever state the dev DB happens to
// be in — is clean on rollback. Nothing is ever committed, and we never touch
// the typeorm migrations bookkeeping table (unlike migration.down()), so there
// is no "marked applied but missing" footgun.
(HAS_DB ? describe : describe.skip)(
  "SeedServiceStatus migration (smoke)",
  () => {
    let dataSource: DataSource;
    let qr: QueryRunner;

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

    beforeEach(async () => {
      qr = dataSource.createQueryRunner();
      await qr.startTransaction();

      // Clean slate within the transaction: rebuild the current schema so the
      // seed's `ON CONFLICT (slug)` has the unique index to infer.
      await qr.query(`DROP TABLE IF EXISTS "service_status_audit_log"`);
      await qr.query(`DROP TABLE IF EXISTS "service_status"`);
      await qr.query(`DROP TYPE IF EXISTS "service_status_enum"`);
      await qr.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      await qr.query(
        `CREATE TYPE "service_status_enum" AS ENUM('enabled', 'form_disabled', 'disabled')`,
      );
      await qr.query(`
        CREATE TABLE "service_status" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "slug" varchar(100) NOT NULL,
          "status" "service_status_enum" NOT NULL DEFAULT 'enabled'
        )`);
      await qr.query(
        `CREATE UNIQUE INDEX "ix_service_status_slug" ON "service_status" ("slug")`,
      );
      await qr.query(`
        CREATE TABLE "service_status_audit_log" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "slug" varchar(100) NOT NULL,
          "old_state" "service_status_enum",
          "new_state" "service_status_enum" NOT NULL,
          "author" varchar(255) NOT NULL,
          "changed_at" TIMESTAMP NOT NULL DEFAULT NOW()
        )`);
    });

    afterEach(async () => {
      await qr.rollbackTransaction();
      await qr.release();
    });

    const migration = new SeedServiceStatus1783520007424();

    async function count(sql: string, params: unknown[] = []): Promise<number> {
      const rows = await qr.query(sql, params);
      return Number(rows[0].count);
    }

    it("seeds every row with a first audit entry (old_state NULL, author seed:#1650)", async () => {
      await migration.up(qr);

      const seedCount = await count(`SELECT count(*)::int FROM service_status`);
      expect(seedCount).toBeGreaterThan(0);

      // One audit row per seeded status row, all authored by the seed.
      const auditCount = await count(
        `SELECT count(*)::int FROM service_status_audit_log WHERE author = 'seed:#1650'`,
      );
      expect(auditCount).toBe(seedCount);

      // First-ever entries: old_state is always NULL.
      const withOldState = await count(
        `SELECT count(*)::int FROM service_status_audit_log WHERE old_state IS NOT NULL`,
      );
      expect(withOldState).toBe(0);

      // Each audit new_state matches the seeded status for its slug.
      const mismatched = await count(
        `SELECT count(*)::int FROM service_status s
         JOIN service_status_audit_log a ON a.slug = s.slug
         WHERE a.new_state <> s.status`,
      );
      expect(mismatched).toBe(0);
    });

    it("is idempotent: running up() twice inserts nothing new", async () => {
      await migration.up(qr);
      const statusAfterFirst = await count(
        `SELECT count(*)::int FROM service_status`,
      );
      const auditAfterFirst = await count(
        `SELECT count(*)::int FROM service_status_audit_log`,
      );

      await migration.up(qr);

      expect(await count(`SELECT count(*)::int FROM service_status`)).toBe(
        statusAfterFirst,
      );
      expect(
        await count(`SELECT count(*)::int FROM service_status_audit_log`),
      ).toBe(auditAfterFirst);
    });

    it("leaves a pre-existing row untouched and writes no audit row for it", async () => {
      // Discover a genuinely-seeded slug and its seeded status.
      await migration.up(qr);
      const [{ slug, status: seededStatus }] = await qr.query(
        `SELECT slug, status FROM service_status ORDER BY slug LIMIT 1`,
      );
      const seedCount = await count(`SELECT count(*)::int FROM service_status`);

      // Reset, then simulate an admin who toggled this slug before the seed ran:
      // a pre-existing row with a DIFFERENT status and no audit history.
      await qr.query(`DELETE FROM service_status_audit_log`);
      await qr.query(`DELETE FROM service_status`);
      const preexisting = seededStatus === "disabled" ? "enabled" : "disabled";
      await qr.query(
        `INSERT INTO service_status (slug, status) VALUES ($1, $2::service_status_enum)`,
        [slug, preexisting],
      );

      await migration.up(qr);

      // Its status is left exactly as the admin set it (ON CONFLICT DO NOTHING).
      const [{ status: after }] = await qr.query(
        `SELECT status FROM service_status WHERE slug = $1`,
        [slug],
      );
      expect(after).toBe(preexisting);

      // And it gained no audit row — only newly-inserted rows are audited.
      expect(
        await count(
          `SELECT count(*)::int FROM service_status_audit_log WHERE slug = $1`,
          [slug],
        ),
      ).toBe(0);

      // Every other seed row was still inserted, so the total matches the seed.
      expect(await count(`SELECT count(*)::int FROM service_status`)).toBe(
        seedCount,
      );
    });
  },
);
