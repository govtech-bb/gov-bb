import { createFileRoute } from "@tanstack/react-router";
import { count, max } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "#/lib/db";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

async function handleGet(): Promise<Response> {
  if (!hasDatabase()) return jsonError("DATABASE_URL not set", 503);
  const db = await getDb();

  const byDocKind = await db
    .select({ kind: schema.documents.kind, count: count() })
    .from(schema.documents)
    .groupBy(schema.documents.kind)
    .orderBy(schema.documents.kind);

  const byChunkKind = await db
    .select({ kind: schema.chunks.kind, count: count() })
    .from(schema.chunks)
    .groupBy(schema.chunks.kind)
    .orderBy(schema.chunks.kind);

  const [latest] = await db
    .select({ updated: max(schema.documents.updatedAt) })
    .from(schema.documents);

  return jsonOk({
    documentsByKind: Object.fromEntries(
      byDocKind.map((r) => [r.kind, r.count]),
    ),
    chunksByKind: Object.fromEntries(byChunkKind.map((r) => [r.kind, r.count])),
    lastUpdated: latest?.updated?.toISOString() ?? null,
  });
}

export const Route = createFileRoute("/api/documents")({
  server: {
    handlers: {
      GET: () => handleGet(),
    },
  },
});
