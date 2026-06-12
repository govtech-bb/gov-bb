import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "#/lib/db";

// The landing path a form handoff should link to, looked up from the RAG
// document whose metadata carries the form's id. The content frontmatter is
// the single source of truth (form_id + category + start.md presence flow in
// at ingest), so there is no hand-maintained form→URL map to drift. Returns
// the canonical service path with "/start" appended when the service has a
// start page ("what you will need" + the Start now button), or null when no
// public service document claims the form — callers fall back to the bare
// forms-app URL.
//
// Fail-soft by design: a missing DATABASE_URL or a query error must never
// break a handoff turn — the fallback link still works.

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: string | null; expiresAt: number }>();

interface StartPageRow extends Record<string, unknown> {
  url: string;
  has_start: string | null;
}

// Pure path derivation, split out for tests: the doc url's pathname plus the
// start sub-page when the service has one.
export function startPathFromDoc(
  url: string,
  hasStart: boolean,
): string | null {
  let path: string;
  try {
    path = new URL(url).pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  if (!path || path === "/") return null;
  return hasStart ? `${path}/start` : path;
}

export async function landingStartPath(formId: string): Promise<string | null> {
  const hit = cache.get(formId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: string | null = null;
  if (hasDatabase()) {
    try {
      const db = await getDb();
      const res = await db.execute<StartPageRow>(sql`
        SELECT url, metadata->>'hasStartPage' AS has_start
        FROM documents
        WHERE kind = 'service'
          AND metadata->>'formId' = ${formId}
          AND metadata->>'status' IS DISTINCT FROM 'draft'
          AND metadata->>'status' IS DISTINCT FROM 'preview'
        LIMIT 1
      `);
      const row = res.rows[0];
      if (row) value = startPathFromDoc(row.url, row.has_start === "true");
    } catch (err) {
      console.warn(
        `[chat] start-page lookup failed for ${formId}:`,
        err instanceof Error ? err.message : err,
      );
      // Don't cache the failure long — a transient DB blip shouldn't pin the
      // fallback URL for a full TTL.
      cache.set(formId, { value: null, expiresAt: Date.now() + 30_000 });
      return null;
    }
  }
  cache.set(formId, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
