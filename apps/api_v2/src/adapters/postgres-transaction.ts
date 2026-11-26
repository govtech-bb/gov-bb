/**
 * The write transaction the Postgres stores share. It sets the transaction's
 * `app.user_id`, which the change-log trigger records against every write; a
 * failure other than the work's own error result becomes
 * `ContentStoreUnavailable`, with the driver's error kept only as its cause.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../db";
import type { UserId } from "../modules/auth";
import { ContentStoreUnavailable } from "../modules/page";
import { err, type Result } from "../modules/result";

/** The shared content lock's advisory lock key; holding it orders page and category writes. */
export const CONTENT_LOCK_KEY = sql`hashtext('content_pages.parent_id')`;

/**
 * Run `work` in one transaction as `actorId`, whom the change-log trigger
 * records, taking the shared content lock first when `contentLock` is set. An
 * error result rolls back everything the work wrote and is returned as it
 * came; any other failure becomes `ContentStoreUnavailable`. The setting is
 * transaction-local, so a pooled connection never carries it into another
 * request.
 */
export async function transactAs<R extends Result<unknown, Error>>(
  db: Database,
  actorId: UserId,
  { contentLock }: { contentLock: boolean },
  work: (tx: Database) => Promise<R>,
): Promise<R | Result<never, ContentStoreUnavailable>> {
  let refused: R | undefined;
  try {
    return await db.transaction(async (tx) => {
      if (contentLock) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(${CONTENT_LOCK_KEY})`,
        );
      }
      await tx.execute(sql`select set_config('app.user_id', ${actorId}, true)`);
      const result = await work(tx);
      if (!result.ok) {
        refused = result;
        tx.rollback();
      }
      return result;
    });
  } catch (cause) {
    return refused ?? err(new ContentStoreUnavailable("transaction", cause));
  }
}
