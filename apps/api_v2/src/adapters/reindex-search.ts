import { sql } from "drizzle-orm";
import type { Database } from "../db";
import { ContentStoreUnavailable } from "../modules/page";
import { err, ok, type Result } from "../modules/result";
import { chunkMarkdown } from "../modules/search-text";
import { contentPages } from "../schema";
import { writeSearchChunks } from "./postgres-pages";

/**
 * Rebuilds search only on explicit apply, atomically against the current page bodies.
 * The content lock excludes editor writes; page bytes, timestamps and history are never changed.
 */
export async function reindexSearchChunks(
  db: Database,
  mode: "check" | "apply",
): Promise<Result<{ pages: number; chunks: number }, ContentStoreUnavailable>> {
  try {
    return ok(
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('content_pages.parent_id'))`,
        );
        const pages = await tx
          .select({
            id: contentPages.id,
            body: contentPages.bodyMarkdown,
          })
          .from(contentPages);
        let chunks = 0;
        for (const page of pages) {
          const projected = chunkMarkdown(page.body);
          chunks += projected.length;
          if (mode === "apply") await writeSearchChunks(tx, page.id, projected);
        }
        return { pages: pages.length, chunks };
      }),
    );
  } catch (cause) {
    return err(new ContentStoreUnavailable("reindexSearchChunks", cause));
  }
}
