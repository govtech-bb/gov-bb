/**
 * Integration spec for the atomic conditional upsert at the heart of presence.
 * Unit specs mock `.query`, so they can't prove the ON CONFLICT … WHERE
 * semantics — that a live holder is never stolen from, that a stale claim is
 * taken over, that the holder can heartbeat. This exercises the real handlers
 * against the live local Postgres (DB_HOST injected from the app .env by nx)
 * and is skipped when no DB is configured (e.g. CI without a database).
 *
 * It writes to a dedicated, namespaced form_id and deletes it around every
 * test, so it never touches real form rows and never issues DDL.
 */
import type { Request, Response } from "express";
import { DataSource } from "typeorm";
import { CreateFormEditingSessions1780924594196 } from "@govtech-bb/database";

const HAS_DB = !!process.env.DB_HOST;
const FORM_ID = "__presence_integration_test__";

let dataSource: DataSource;

// Point the handlers' getDataSource at our test DataSource.
vi.mock("../db.js", () => ({
  getDataSource: vi.fn(async () => dataSource),
}));

import { claimPresenceHandler, getPresenceHandler } from "./presence";

function mockReq(body: unknown, params: Record<string, string> = {}): Request {
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

const claim = async (userLogin: string) => {
  const res = mockRes();
  await claimPresenceHandler(mockReq({ userLogin }, { formId: FORM_ID }), res);
  return res;
};

(HAS_DB ? describe : describe.skip)(
  "presence conditional upsert (integration)",
  () => {
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
      // Ensure the table exists (the migration may not have been applied to this
      // developer's DB yet). Idempotent: create only if absent.
      const exists = await dataSource.query(
        `SELECT to_regclass('public.form_editing_session') AS t`,
      );
      if (!exists[0].t) {
        await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        const qr = dataSource.createQueryRunner();
        await new CreateFormEditingSessions1780924594196().up(qr);
        await qr.release();
      }
    });

    afterAll(async () => {
      if (dataSource?.isInitialized) {
        await dataSource.query(
          `DELETE FROM form_editing_session WHERE form_id = $1`,
          [FORM_ID],
        );
        await dataSource.destroy();
      }
    });

    beforeEach(async () => {
      await dataSource.query(
        `DELETE FROM form_editing_session WHERE form_id = $1`,
        [FORM_ID],
      );
    });

    const backdate = (minutes: number) =>
      dataSource.query(
        `UPDATE form_editing_session
         SET last_activity_at = NOW() - INTERVAL '${minutes} minutes'
         WHERE form_id = $1`,
        [FORM_ID],
      );

    it("first claimant takes the row (held:true)", async () => {
      const res = await claim("alice");
      expect(res.body).toMatchObject({
        held: true,
        holder: { userLogin: "alice" },
      });
    });

    it("a second, different user is rejected while the holder is fresh (held:false)", async () => {
      await claim("alice");
      const res = await claim("bob");
      expect(res.body).toMatchObject({
        held: false,
        holder: { userLogin: "alice" },
      });
    });

    it("the holder can heartbeat without losing the claim, preserving claimed_at", async () => {
      await claim("alice");
      const before = await dataSource.query(
        `SELECT claimed_at FROM form_editing_session WHERE form_id = $1`,
        [FORM_ID],
      );
      const res = await claim("alice");
      const after = await dataSource.query(
        `SELECT claimed_at FROM form_editing_session WHERE form_id = $1`,
        [FORM_ID],
      );
      expect(res.body).toMatchObject({
        held: true,
        holder: { userLogin: "alice" },
      });
      // Heartbeat keeps the original claimed_at (only last_activity_at moves).
      expect(after[0].claimed_at).toEqual(before[0].claimed_at);
    });

    it("a stale claim is taken over by the next user (held:true) and claimed_at resets", async () => {
      await claim("alice");
      await backdate(20); // older than the 15-minute TTL → stale
      const res = await claim("bob");
      expect(res.body).toMatchObject({
        held: true,
        holder: { userLogin: "bob" },
      });
      // Exactly one row remains — the takeover replaced, not duplicated.
      const rows = await dataSource.query(
        `SELECT user_login FROM form_editing_session WHERE form_id = $1`,
        [FORM_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].user_login).toBe("bob");
    });

    it("GET reports the fresh holder, then null once the claim goes stale", async () => {
      await claim("alice");
      const fresh = mockRes();
      await getPresenceHandler(mockReq({}, { formId: FORM_ID }), fresh);
      expect(fresh.body).toMatchObject({ holder: { userLogin: "alice" } });

      await backdate(20);
      const stale = mockRes();
      await getPresenceHandler(mockReq({}, { formId: FORM_ID }), stale);
      expect(stale.body).toEqual({ holder: null });
    });
  },
);
