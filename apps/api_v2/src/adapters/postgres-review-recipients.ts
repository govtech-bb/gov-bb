/**
 * Who review emails go to (#3267), read from `auth_user`, `user_roles` and
 * the page hierarchy. Failures become `ContentStoreUnavailable`, the driver's
 * error kept only as its cause.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db";
import { ContentStoreUnavailable, PageId } from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import type { ReviewRecipients } from "../services/review-notifications";

async function attempt<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<Result<T, ContentStoreUnavailable>> {
  try {
    return ok(await run());
  } catch (cause) {
    return err(new ContentStoreUnavailable(operation, cause));
  }
}

const Approver = z.object({ id: z.string(), email: z.string() });

/** Recipient lookups over the process's database. */
export class PostgresReviewRecipients implements ReviewRecipients {
  /** The process's database handle. */
  constructor(private readonly db: Database) {}

  async approvers(): Promise<
    Result<{ id: string; email: string }[], ContentStoreUnavailable>
  > {
    const rows = await attempt("approvers", () =>
      this.db.execute(sql`
        select u.id, u.email from auth_user u
        join user_roles r on r.user_id = u.id and r.role = 'approver'
        order by u.email`),
    );
    return rows.ok ? ok(z.array(Approver).parse(rows.value.rows)) : rows;
  }

  async emailOf(
    userId: string,
  ): Promise<Result<string | null, ContentStoreUnavailable>> {
    const rows = await attempt("emailOf", () =>
      this.db.execute<{ email: string }>(
        sql`select email from auth_user where id = ${userId}`,
      ),
    );
    return rows.ok ? ok(rows.value.rows[0]?.email ?? null) : rows;
  }

  async serviceOf(
    pageId: PageId,
  ): Promise<Result<PageId, ContentStoreUnavailable>> {
    // The parent chain's top, as the service index groups pages; a loop in
    // the data ends rather than repeating, and a missing page is its own.
    const rows = await attempt("serviceOf", () =>
      this.db.execute<{ id: string }>(sql`
        with recursive chain as (
          select id, parent_id from content_pages where id = ${pageId}
          union all
          select p.id, p.parent_id from content_pages p
            join chain on p.id = chain.parent_id
        ) cycle id set is_cycle using path
        select id from chain where parent_id is null and not is_cycle`),
    );
    if (!rows.ok) return rows;
    const top = rows.value.rows[0]?.id;
    return ok(top === undefined ? pageId : PageId.parse(top));
  }
}
