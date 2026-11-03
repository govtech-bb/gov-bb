/**
 * Moves GitHub-era users to their Workspace addresses (#3418). BetterAuth
 * links a Google sign-in to an existing user only when the emails match, so
 * a user whose GitHub email isn't their Workspace email would otherwise get a
 * new user on first Google sign-in, losing their roles and history. Changing
 * the email keeps the user id, so `user_roles`, `change_events.actor` and the
 * revision columns stay attached. It runs on every boot and changes nothing
 * once a move is done.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EmailMove } from "../config";
import type { Database } from "../db";

/**
 * What happened to one move: `moved`, `done` when it already had, `missing`
 * when no user has either address, and `conflict` when both users exist and
 * the Workspace one already has history, which needs a person to merge.
 */
export type EmailMoveOutcome = "moved" | "done" | "missing" | "conflict";

const userRow = z.object({ id: z.string() });

/** Apply each move in its own transaction, and report what each one did. */
export async function moveEmails(
  db: Database,
  moves: readonly EmailMove[],
): Promise<EmailMoveOutcome[]> {
  const outcomes: EmailMoveOutcome[] = [];
  for (const { from, to } of moves)
    outcomes.push(
      await db.transaction(async (tx): Promise<EmailMoveOutcome> => {
        const find = async (email: string) => {
          const found = await tx.execute(
            sql`select id from auth_user where lower(email) = ${email} for update`,
          );
          return z.array(userRow).parse(found.rows)[0]?.id;
        };
        const old = await find(from);
        const current = await find(to);
        if (old === undefined)
          return current === undefined ? "missing" : "done";
        if (current !== undefined) {
          // Signed in with Google before the move: drop that new user, unless
          // it has authored something, so the sign-in links to the old one.
          const history = await tx.execute(sql`
            select 1 from change_events where actor = ${current}
            union all
            select 1 from page_revisions
            where ${current} in (created_by, submitted_by, decided_by)
               or ${current} = any(contributors)
            limit 1`);
          if (history.rows.length > 0) return "conflict";
          await tx.execute(sql`delete from auth_user where id = ${current}`);
        }
        await tx.execute(
          sql`update auth_user set email = ${to}, "updatedAt" = now() where id = ${old}`,
        );
        return "moved";
      }),
    );
  return outcomes;
}
