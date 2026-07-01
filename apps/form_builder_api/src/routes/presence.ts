import { Router, type Request, type Response } from "express";
import { getDataSource } from "../db.js";
import { readUserLogin } from "../utils/request.js";
import { badRequest } from "../lib/http-error.js";

export const presenceRouter = Router();

/**
 * A claim is "fresh" for this many minutes after its last activity. Past that
 * it's stale: ignored on read and overwritable by the next claimant. This is
 * the guarantee behind the lock — eager release on leave is only best-effort.
 */
const PRESENCE_TTL_MINUTES = 15;

// SQL fragment: the row is a *fresh* claim. Used on read and as the inverse of
// the stale-takeover condition on claim, so both agree on the boundary.
const FRESH = `last_activity_at > NOW() - INTERVAL '${PRESENCE_TTL_MINUTES} minutes'`;

// Anything exposing TypeORM's `.query`. Both the DataSource and an
// EntityManager satisfy it, so holdsFreshClaim works standalone (presence
// routes) and inside the save/publish transaction (write enforcement).
interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any[]>;
}

interface PresenceHolder {
  userLogin: string;
  claimedAt: string;
  lastActivityAt: string;
}

function toHolder(row: {
  user_login: string;
  claimed_at: string;
  last_activity_at: string;
}): PresenceHolder {
  return {
    userLogin: row.user_login,
    claimedAt: row.claimed_at,
    lastActivityAt: row.last_activity_at,
  };
}

/**
 * True iff `userLogin` currently holds a *fresh* claim on `formId`. Shared by
 * the presence routes and the save/publish write enforcement so both agree on
 * exactly who "the holder" is. An empty login never holds a claim.
 */
export async function holdsFreshClaim(
  db: Queryable,
  formId: string,
  userLogin: string,
): Promise<boolean> {
  if (!userLogin) return false;
  const rows = await db.query(
    `SELECT 1 FROM form_editing_session
     WHERE form_id = $1 AND user_login = $2 AND ${FRESH}
     LIMIT 1`,
    [formId, userLogin],
  );
  return rows.length > 0;
}

// PUT /builder/forms/:formId/presence — claim or heartbeat.
//
// Atomic conditional upsert: insert when absent; on conflict update *only* if
// the existing row is mine (heartbeat) or stale (takeover) — never a blind
// upsert that would steal a live holder's claim. When the WHERE filters the
// update out (someone else holds a fresh claim), RETURNING yields no row, so we
// read the current holder and report held:false instead.
export async function claimPresenceHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const formId = String(req.params.formId);
  const userLogin = readUserLogin(req.body);
  if (!userLogin) {
    throw badRequest("userLogin is required");
  }
  const ds = await getDataSource();
  const upsertSql = `INSERT INTO form_editing_session (form_id, user_login, claimed_at, last_activity_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (form_id) DO UPDATE
         SET user_login = EXCLUDED.user_login,
             claimed_at = CASE
               WHEN form_editing_session.user_login = EXCLUDED.user_login
               THEN form_editing_session.claimed_at
               ELSE NOW()
             END,
             last_activity_at = NOW()
         WHERE form_editing_session.user_login = EXCLUDED.user_login
            OR form_editing_session.last_activity_at <= NOW() - INTERVAL '${PRESENCE_TTL_MINUTES} minutes'
       RETURNING user_login, claimed_at, last_activity_at`;

  // Up to two attempts. The conditional upsert can be filtered (a different
  // user holds a fresh claim) yet the follow-up holder read can come back
  // empty if that claim lapsed in the gap between the two statements — in
  // which case the claim is now free, so we retry the upsert and take it over
  // rather than locking the caller read-only against a holder that's gone.
  for (let attempt = 0; attempt < 2; attempt++) {
    const claimed = await ds.query(upsertSql, [formId, userLogin]);
    if (claimed.length > 0) {
      res.json({ held: true, holder: toHolder(claimed[0]) });
      return;
    }
    const current = await ds.query(
      `SELECT user_login, claimed_at, last_activity_at FROM form_editing_session
         WHERE form_id = $1 AND ${FRESH}
         LIMIT 1`,
      [formId],
    );
    if (current.length > 0) {
      res.json({ held: false, holder: toHolder(current[0]) });
      return;
    }
    // No fresh holder despite the filtered upsert → retry to take it over.
  }
  // Still unclaimed after the retry (lost a race to yet another claimant, or
  // a transient): report free-but-not-held; the client re-syncs next tick.
  res.json({ held: false, holder: null });
}
presenceRouter.put("/:formId/presence", claimPresenceHandler);

// GET /builder/forms/:formId/presence — the current holder, only if fresh.
export async function getPresenceHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const formId = String(req.params.formId);
  const ds = await getDataSource();
  const rows = await ds.query(
    `SELECT user_login, claimed_at, last_activity_at FROM form_editing_session
       WHERE form_id = $1 AND ${FRESH}
       LIMIT 1`,
    [formId],
  );
  res.json({ holder: rows.length > 0 ? toHolder(rows[0]) : null });
}
presenceRouter.get("/:formId/presence", getPresenceHandler);

// DELETE /builder/forms/:formId/presence — release; only deletes the row if
// it's mine. Best-effort (the TTL is the real guarantee), so it's a no-op when
// the claim has already moved on.
export async function releasePresenceHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const formId = String(req.params.formId);
  const userLogin = readUserLogin(req.body);
  if (!userLogin) {
    throw badRequest("userLogin is required");
  }
  const ds = await getDataSource();
  await ds.query(
    `DELETE FROM form_editing_session WHERE form_id = $1 AND user_login = $2`,
    [formId, userLogin],
  );
  res.json({ released: true });
}
presenceRouter.delete("/:formId/presence", releasePresenceHandler);
