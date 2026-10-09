import { DataSource } from "typeorm";
import { CreateWaterOpsAlerts1791536637000 } from "@govtech-bb/database";
import { WaterOpsAlertRepository } from "./water-ops-alert.repository";

// The ops-alert de-duplication (#2970) lives in the SQL, which the unit spec
// can only check as text. This runs the real statements against Postgres:
// set DB_HOST etc. to a database you can write to (skipped otherwise, like the
// other smoke specs). Rows use a unique key prefix and are deleted afterwards;
// the table is created (and dropped) only if it isn't already there.
const HAS_DB = !!process.env.DB_HOST;

(HAS_DB ? describe : describe.skip)(
  "WaterOpsAlertRepository against Postgres (smoke)",
  () => {
    const prefix = `__smoke-2970-${Date.now()}-`;
    let dataSource: DataSource;
    let repo: WaterOpsAlertRepository;
    let createdTable = false;

    const repoOn = (manager: unknown) =>
      new WaterOpsAlertRepository({
        createEntityManager: () => manager,
      } as unknown as DataSource);

    /** Move a row's timestamps into the past, as if time had passed. */
    const age = (key: string, interval: string) =>
      dataSource.query(
        `UPDATE "water_ops_alerts"
         SET "failing_since" = "failing_since" - $2::interval,
             "last_alerted_at" = "last_alerted_at" - $2::interval
         WHERE "key" = $1`,
        [key, interval],
      );

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
      const [{ exists }] = await dataSource.query(
        `SELECT to_regclass('public.water_ops_alerts') IS NOT NULL AS "exists"`,
      );
      if (!exists) {
        const runner = dataSource.createQueryRunner();
        await new CreateWaterOpsAlerts1791536637000().up(runner);
        await runner.release();
        createdTable = true;
      }
      repo = repoOn(dataSource.createEntityManager());
    });

    afterAll(async () => {
      if (!dataSource?.isInitialized) return;
      if (createdTable) {
        const runner = dataSource.createQueryRunner();
        await new CreateWaterOpsAlerts1791536637000().down(runner);
        await runner.release();
      } else {
        await dataSource.query(
          `DELETE FROM "water_ops_alerts" WHERE "key" LIKE $1`,
          [`${prefix}%`],
        );
      }
      await dataSource.destroy();
    });

    it("alerts once, stays quiet, reminds after 6 hours, recovers once", async () => {
      const key = `${prefix}lifecycle`;
      expect(await repo.recordFailure(key, "6 hours")).toMatchObject({
        kind: "first",
      });
      expect(await repo.recordFailure(key, "6 hours")).toBeNull();

      await age(key, "6 hours 1 minute");
      expect(await repo.recordFailure(key, "6 hours")).toMatchObject({
        kind: "reminder",
      });

      expect(await repo.recordRecovery(key)).toBeInstanceOf(Date);
      expect(await repo.recordRecovery(key)).toBeNull();
    });

    it("keeps a flapping failure to one alert and one recovery per window", async () => {
      const key = `${prefix}flapping`;
      expect(await repo.recordFailure(key, "6 hours")).not.toBeNull();
      expect(await repo.recordRecovery(key)).not.toBeNull();

      await age(key, "30 minutes");
      expect(await repo.recordFailure(key, "6 hours")).toBeNull(); // recorded, quiet
      expect(await repo.recordRecovery(key)).toBeNull(); // never told, so silent

      await age(key, "6 hours");
      expect(await repo.recordFailure(key, "6 hours")).not.toBeNull();
    });

    it("lets exactly one of two concurrent tasks alert", async () => {
      const key = `${prefix}race`;
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        const a = await repoOn(runner.manager).recordFailure(key, "6 hours");
        // B blocks on A's uncommitted row, then sees it once A commits.
        const b = repo.recordFailure(key, "6 hours");
        await new Promise((resolve) => setTimeout(resolve, 200));
        await runner.commitTransaction();
        expect(a).not.toBeNull();
        expect(await b).toBeNull();
      } finally {
        // An assertion or query failing mid-transaction must not hand an
        // aborted connection back to the pool for the next test.
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    });

    it("reports a skipped notice once, and again after its claim is released", async () => {
      const key = `${prefix}skipped`;
      expect(await repo.claimNew([key])).toEqual([key]);
      expect(await repo.claimNew([key])).toEqual([]);

      await repo.releaseClaims([key]);
      expect(await repo.claimNew([key])).toEqual([key]);
    });

    it("recovers silently after an undelivered alert, and starts fresh after markHealthy", async () => {
      const key = `${prefix}reset`;
      expect(await repo.recordFailure(key, "6 hours")).not.toBeNull();
      await repo.forgetAlert(key);
      expect(await repo.recordRecovery(key)).toBeNull();

      expect(await repo.recordFailure(key, "6 hours")).toMatchObject({
        kind: "first",
      });
      await repo.markHealthy(key);
      await age(key, "6 hours 1 minute");
      expect(await repo.recordFailure(key, "6 hours")).toMatchObject({
        kind: "first",
      });
    });
  },
);
