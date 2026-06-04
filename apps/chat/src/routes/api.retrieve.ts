import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hasDatabase } from "#/lib/db";
import { jsonError } from "#/lib/http";
import { search } from "#/lib/rag/retrieve";

const RequestSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(50).default(8),
  boostSlug: z.string().min(1).optional(),
});

async function handlePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  if (!hasDatabase()) {
    return jsonError("DATABASE_URL not set; bring up postgres + seed", 503);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }

  try {
    const result = await search(
      parsed.data.query,
      parsed.data.topK,
      parsed.data.boostSlug,
    );
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "retrieve failed";
    console.error("[rag/retrieve]", message);
    return jsonError(message, 500);
  }
}

export const Route = createFileRoute("/api/retrieve")({
  server: {
    handlers: {
      POST: ({ request }) => handlePost({ request }),
    },
  },
});
