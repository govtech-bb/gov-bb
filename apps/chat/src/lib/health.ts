import { count, desc, max } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "#/lib/db";

// The most recent ingest run, surfaced so the deploy workflow can gate on
// ingest completion instead of fire-and-forget (#1269): it polls /api/health
// until a run STARTED AFTER its trigger finishes, and fails the job when that
// run failed.
export interface LastIngest {
  status: string; // running | success | failed
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface HealthReport {
  ok: boolean;
  db: "connected" | "disconnected" | "unconfigured";
  docCount: number | null;
  chunkCount: number | null;
  lastUpdatedAt: string | null;
  lastIngest: LastIngest | null;
}

export async function checkHealth(): Promise<HealthReport> {
  if (!hasDatabase()) {
    return {
      ok: false,
      db: "unconfigured",
      docCount: null,
      chunkCount: null,
      lastUpdatedAt: null,
      lastIngest: null,
    };
  }
  try {
    const db = await getDb();
    const [docs] = await db
      .select({ count: count(), updated: max(schema.documents.updatedAt) })
      .from(schema.documents);
    const [chunks] = await db.select({ count: count() }).from(schema.chunks);
    const [run] = await db
      .select({
        status: schema.ingestRuns.status,
        startedAt: schema.ingestRuns.startedAt,
        finishedAt: schema.ingestRuns.finishedAt,
        errorMessage: schema.ingestRuns.errorMessage,
      })
      .from(schema.ingestRuns)
      .orderBy(desc(schema.ingestRuns.startedAt))
      .limit(1);
    return {
      ok: true,
      db: "connected",
      docCount: docs?.count ?? 0,
      chunkCount: chunks?.count ?? 0,
      lastUpdatedAt: docs?.updated?.toISOString() ?? null,
      lastIngest: run
        ? {
            status: run.status,
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt?.toISOString() ?? null,
            error: run.errorMessage,
          }
        : null,
    };
  } catch (err) {
    console.error("[health] db check failed:", err);
    return {
      ok: false,
      db: "disconnected",
      docCount: null,
      chunkCount: null,
      lastUpdatedAt: null,
      lastIngest: null,
    };
  }
}
