import { createFileRoute } from "@tanstack/react-router";
import { count, max } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "#/lib/db";

interface HealthReport {
  ok: boolean;
  db: "connected" | "disconnected" | "unconfigured";
  docCount: number | null;
  chunkCount: number | null;
  lastUpdatedAt: string | null;
}

async function dbStatus(): Promise<
  Pick<HealthReport, "db" | "docCount" | "chunkCount" | "lastUpdatedAt">
> {
  if (!hasDatabase()) {
    return {
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
      db: "connected",
      docCount: docs?.count ?? 0,
      chunkCount: chunks?.count ?? 0,
      lastUpdatedAt: docs?.updated?.toISOString() ?? null,
    };
  } catch (err) {
    console.error("[health] db check failed:", err);
    return {
      db: "disconnected",
      docCount: null,
      chunkCount: null,
      lastUpdatedAt: null,
    };
  }
}

async function handleGet(): Promise<Response> {
  const status = await dbStatus();
  const report: HealthReport = {
    ok: status.db !== "disconnected",
    ...status,
  };
  return new Response(JSON.stringify(report), {
    status: report.ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => handleGet(),
    },
  },
});
