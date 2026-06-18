import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hasDatabase } from "#/lib/db";
import { search } from "#/lib/rag/retrieve";
import { TOP_K } from "#/lib/rag/config";

const RequestSchema = z.object({
  query: z.string().min(1),
  // Default to the same TOP_K the in-process /api/chat path uses, so this debug
  // surface returns the production result set, not a divergent one.
  topK: z.number().int().positive().max(50).default(TOP_K),
});

// Error responses are inlined (the ts-react-chat example does the same — no
// shared helper): JSON body, explicit status.
const errorResponse = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });

async function handlePost(request: Request): Promise<Response> {
  if (!hasDatabase()) {
    return errorResponse(
      "DATABASE_URL not set; bring up postgres + ingest",
      503,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "Invalid request",
      400,
    );
  }

  try {
    const result = await search(parsed.data.query, parsed.data.topK);
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "retrieve failed";
    console.error("[rag/retrieve]", message);
    return errorResponse(message, 500);
  }
}

export const Route = createFileRoute("/api/retrieve")({
  server: {
    handlers: {
      POST: ({ request }) => handlePost(request),
    },
  },
});
