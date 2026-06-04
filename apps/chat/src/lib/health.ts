import { count, max } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "#/lib/db";

export interface HealthReport {
  ok: boolean;
  db: "connected" | "disconnected" | "unconfigured";
  docCount: number | null;
  chunkCount: number | null;
  lastUpdatedAt: string | null;
}

export async function checkHealth(): Promise<HealthReport> {
  if (!hasDatabase()) {
    return {
      ok: false,
      db: "unconfigured",
      docCount: null,
      chunkCount: null,
      lastUpdatedAt: null,
    };
  }
  try {
    const db = await getDb();
    const [docs] = await db
      .select({ count: count(), updated: max(schema.documents.updatedAt) })
      .from(schema.documents);
    const [chunks] = await db.select({ count: count() }).from(schema.chunks);
    return {
      ok: true,
      db: "connected",
      docCount: docs?.count ?? 0,
      chunkCount: chunks?.count ?? 0,
      lastUpdatedAt: docs?.updated?.toISOString() ?? null,
    };
  } catch (err) {
    console.error("[health] db check failed:", err);
    return {
      ok: false,
      db: "disconnected",
      docCount: null,
      chunkCount: null,
      lastUpdatedAt: null,
    };
  }
}
