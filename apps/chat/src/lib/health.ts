import { count, desc, max } from "drizzle-orm";
import { hasDatabase, schema, withDbAuthRetry } from "#/lib/db";
import { logger } from "#/lib/observability/logger";

// The most recent ingest run, surfaced so the deploy workflow can gate on
// ingest completion instead of fire-and-forget: it polls /api/health until a
// run started AFTER its trigger has finished, and fails the job if that run
// failed.
interface LastIngest {
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

// Reports DB connectivity, corpus size, and last-ingest status. `ok` is false
// when the DB is unconfigured or unreachable, so /api/health can return 503 and
// a load balancer / deploy gate can act on it.
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
    return await withDbAuthRetry(async (db) => {
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
        ok: true as const,
        db: "connected" as const,
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
    });
  } catch (err) {
    logger.error("health.db_check_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
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
