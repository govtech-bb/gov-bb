/**
 * The migration runner.
 *
 * Deliberately small: a numbered migration module, a table recording what has
 * run, and each one executed as one script. `drizzle-kit generate` would
 * normally emit the SQL; for the spike the DDL is hand-written because it has
 * to stay identical to the block editor spike's `001_init`, which is the
 * version that has actually been exercised in a browser.
 *
 * The runner takes an `exec` rather than using `db.execute`, because a
 * migration is a *script* and `db.execute` sends one statement through the
 * extended query protocol — a multi-statement file fails there with 42601.
 * The caller supplies the simple-query path: `pool.query`.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import { SQL as INIT_SQL } from "./migrations/001_init";
import { SQL as MARKDOWN_PAGES_SQL } from "./migrations/002_markdown_pages";
import { SQL as AUTH_SQL } from "./migrations/003_auth";
import { SQL as GITHUB_SESSIONS_SQL } from "./migrations/004_github_sessions";
import { SQL as HIERARCHY_SQL } from "./migrations/005_hierarchy_and_search";
import { SQL as UNPUBLISHED_SQL } from "./migrations/006_change_action_unpublished";
import { SQL as CHANGE_HISTORY_SQL } from "./migrations/007_change_history_trigger";
import { SQL as USER_ROLES_SQL } from "./migrations/008_user_roles";
import { SQL as DEFAULT_EDITOR_SQL } from "./migrations/009_default_editor_role";
import { SQL as PAGE_REVISIONS_SQL } from "./migrations/010_page_revisions";
import { SQL as REVISION_REVIEW_SQL } from "./migrations/011_revision_review";
import { SQL as REVIEW_ACTIONS_SQL } from "./migrations/012_change_action_review";
import { SQL as REVIEW_HISTORY_SQL } from "./migrations/013_review_history_trigger";
import { SQL as DATA_COLLECTIONS_SQL } from "./migrations/014_data_collections";
import { SQL as REVISION_DISCARDED_SQL } from "./migrations/015_revision_discarded";
import { SQL as CONTENT_UPDATED_AT_SQL } from "./migrations/016_content_updated_at";
import { SQL as NO_TRUNCATE_SQL } from "./migrations/017_change_events_no_truncate";
import { SQL as SNAPSHOT_VERSION_SQL } from "./migrations/018_snapshot_version";
import { SQL as REDACTION_SQL } from "./migrations/019_change_events_redaction";
import { SQL as GOOGLE_SESSIONS_SQL } from "./migrations/020_google_sessions";
import { SQL as GITHUB_ACCOUNTS_SQL } from "./migrations/021_github_accounts";
import { SQL as RESTORED_FROM_SQL } from "./migrations/022_restored_from";
import { SQL as CHANGE_EVENT_COUNTERS_SQL } from "./migrations/023_change_event_counters";
import { SQL as EDIT_VERSIONS_SQL } from "./migrations/024_edit_versions";
import type { Database } from "./db";

/** The migrations, in the order they apply. Each is idempotent by rule. */
const MIGRATIONS = [
  ["001_init", INIT_SQL],
  ["002_markdown_pages", MARKDOWN_PAGES_SQL],
  ["003_auth", AUTH_SQL],
  ["004_github_sessions", GITHUB_SESSIONS_SQL],
  ["005_hierarchy_and_search", HIERARCHY_SQL],
  ["006_change_action_unpublished", UNPUBLISHED_SQL],
  ["007_change_history_trigger", CHANGE_HISTORY_SQL],
  ["008_user_roles", USER_ROLES_SQL],
  ["009_default_editor_role", DEFAULT_EDITOR_SQL],
  ["010_page_revisions", PAGE_REVISIONS_SQL],
  ["011_revision_review", REVISION_REVIEW_SQL],
  ["012_change_action_review", REVIEW_ACTIONS_SQL],
  ["013_review_history_trigger", REVIEW_HISTORY_SQL],
  ["014_data_collections", DATA_COLLECTIONS_SQL],
  ["015_revision_discarded", REVISION_DISCARDED_SQL],
  ["016_content_updated_at", CONTENT_UPDATED_AT_SQL],
  ["017_change_events_no_truncate", NO_TRUNCATE_SQL],
  ["018_snapshot_version", SNAPSHOT_VERSION_SQL],
  ["019_change_events_redaction", REDACTION_SQL],
  ["020_google_sessions", GOOGLE_SESSIONS_SQL],
  ["021_github_accounts", GITHUB_ACCOUNTS_SQL],
  ["022_restored_from", RESTORED_FROM_SQL],
  ["023_change_event_counters", CHANGE_EVENT_COUNTERS_SQL],
  ["024_edit_versions", EDIT_VERSIONS_SQL],
] as const;

/** Serialises instances that boot together; released when its transaction ends. */
const LOCK = "select pg_advisory_xact_lock(hashtext('api_v2 migrations'));";

/** Runs a whole SQL script, statements and all, as one implicit transaction. */
export type Exec = (script: string) => Promise<unknown>;

/** Apply pending SQL scripts in their existing order, without touching authored content. */
export async function migrate(db: Database, exec: Exec): Promise<string[]> {
  await exec(`${LOCK}
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );`);

  const applied = await db.execute(sql`select name from schema_migrations`);
  const rows = z.array(z.object({ name: z.string() })).parse(applied.rows);
  const done = new Set(rows.map((row) => row.name));

  const ran: string[] = [];
  for (const [name, script] of MIGRATIONS) {
    if (done.has(name)) continue;
    // One simple-query script pins the lock, ledger recheck and migration to
    // the same transaction/connection. A stale runner must not downgrade functions.
    await exec(`${LOCK}
do $migration$ begin
  if not exists (select 1 from schema_migrations where name = '${name}') then
    execute '${script.replaceAll("'", "''")}';
    insert into schema_migrations (name) values ('${name}');
  end if;
end $migration$;`);
    ran.push(name);
  }
  return ran;
}
