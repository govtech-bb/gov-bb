/**
 * Integration spec for the compare-and-swap behind
 * POST /builder/forms/:formId/resync (#2489). The unit spec
 * (forms.resync.spec.ts) pins the SQL text; only a real Postgres can prove the
 * WHERE clause does what its comment says:
 *
 *   - a row whose updated_at never moved since insert is left alone — that is
 *     every pre-#2489 row, because the ORM create path and the seed INSERT both
 *     leave created_at and updated_at to the same NOW() default;
 *   - a row saved before the commit is replaced and reads as saved now;
 *   - a row saved after the commit is kept;
 *   - two concurrent opens replace the row exactly once.
 *
 * Runs against the live local Postgres (DB_HOST from the app .env via nx, or
 * passed explicitly) and is skipped when no DB is configured. Writes only a
 * namespaced form_id, deleted around every test; never issues DDL.
 */
import type { Request, Response } from "express";
import { DataSource } from "typeorm";
import { FormDefinitionEntity } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;
// Kebab-case so it passes the handler's draftRecipeSchema gate, and
// unmistakably synthetic.
const FORM_ID = "zz-resync-integration-test";

let dataSource: DataSource;

// Point the handler's getDataSource at the test DataSource.
vi.mock("../db.js", () => ({
  getDataSource: vi.fn(async () => dataSource),
}));

import { resyncFormHandler } from "./forms";

function mockReq(body: unknown, params: Record<string, string>): Request {
  return { body, params } as unknown as Request;
}
function mockRes() {
  const res = { statusCode: 200, body: undefined as unknown };
  (res as any).status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  (res as any).json = (payload: unknown) => {
    res.body = payload;
    return res;
  };
  return res as typeof res & Response;
}

const recipe = (title: string) => ({ formId: FORM_ID, title, steps: [] });

async function resync(committedAt: string) {
  const res = mockRes();
  await resyncFormHandler(
    mockReq({ recipe: recipe("Committed"), committedAt }, { formId: FORM_ID }),
    res,
  );
  expect(res.statusCode).toBe(200);
  return res.body as { resynced: boolean };
}

async function row() {
  const rows: { title: string; same: boolean }[] = await dataSource.query(
    `SELECT schema->>'title' AS title, updated_at = created_at AS same
       FROM form_definitions WHERE form_id = $1`,
    [FORM_ID],
  );
  return rows[0];
}

/** Insert the way createFormHandler does — through the ORM — so created_at
 *  and updated_at come from the column defaults, exactly as every pre-#2489
 *  row was written. */
async function insertViaOrm() {
  const repo = dataSource.getRepository(FormDefinitionEntity);
  await repo.save(
    repo.create({
      formId: FORM_ID,
      version: null,
      schema: recipe("Draft") as unknown as FormDefinitionEntity["schema"],
      publishedAt: null,
    }),
  );
}

/** Pin both stamps so a test's ordering never depends on the clock. The
 *  fixtures sit a month apart so the session time zone cannot flip them. */
const stamp = (createdAt: string, updatedAt: string) =>
  dataSource.query(
    `UPDATE form_definitions SET created_at = $2, updated_at = $3 WHERE form_id = $1`,
    [FORM_ID, createdAt, updatedAt],
  );

const JAN = "2026-01-01T00:00:00Z";
const FEB = "2026-02-01T00:00:00Z";
const MAR = "2026-03-01T00:00:00Z";

(HAS_DB ? describe : describe.skip)(
  "resync compare-and-swap (integration, #2489)",
  () => {
    beforeAll(async () => {
      dataSource = new DataSource({
        type: "postgres",
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT ?? "5432", 10),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [FormDefinitionEntity],
        synchronize: false,
      });
      await dataSource.initialize();
    });

    afterAll(async () => {
      if (dataSource?.isInitialized) {
        await dataSource.query(
          `DELETE FROM form_definitions WHERE form_id = $1`,
          [FORM_ID],
        );
        await dataSource.destroy();
      }
    });

    beforeEach(async () => {
      await dataSource.query(
        `DELETE FROM form_definitions WHERE form_id = $1`,
        [FORM_ID],
      );
    });

    it("a row inserted through the ORM has updated_at exactly equal to created_at — the shape of every pre-#2489 row", async () => {
      await insertViaOrm();
      // Compared in SQL: Postgres keeps microseconds, a JS Date would not.
      expect((await row()).same).toBe(true);
    });

    it("leaves a row whose updated_at never moved alone, even when the committed recipe is newer", async () => {
      await insertViaOrm();
      // A commit far in the future: the only thing protecting this row is the
      // updated_at > created_at guard.
      expect(await resync("2999-01-01T00:00:00Z")).toEqual({
        resynced: false,
      });
      expect((await row()).title).toBe("Draft");
    });

    it("replaces a row saved before the commit and marks it saved now, so the next open is a no-op", async () => {
      await insertViaOrm();
      await stamp(JAN, FEB);
      expect(await resync(MAR)).toEqual({ resynced: true });
      expect((await row()).title).toBe("Committed");
      expect(await resync(MAR)).toEqual({ resynced: false });
    });

    it("keeps a draft saved after the commit", async () => {
      await insertViaOrm();
      await stamp(JAN, MAR);
      expect(await resync(FEB)).toEqual({ resynced: false });
      expect((await row()).title).toBe("Draft");
    });

    it("reports resynced: false when there is no row", async () => {
      expect(await resync(MAR)).toEqual({ resynced: false });
    });

    it("two concurrent opens replace the row exactly once", async () => {
      await insertViaOrm();
      await stamp(JAN, FEB);
      const results = await Promise.all([resync(MAR), resync(MAR)]);
      expect(results.filter((r) => r.resynced)).toHaveLength(1);
      expect((await row()).title).toBe("Committed");
    });
  },
);
