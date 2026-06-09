import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai";
import {
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { getServerEnv } from "#/config/env";
import { blockedMessageStream } from "#/lib/chat/blocked-stream";
import { runTurn } from "#/lib/chat/run-turn";
import { jsonError } from "#/lib/http";

// Max accepted request body (#973). Generous for legitimate chat history but
// blocks oversized payloads before they're parsed. Per-call token cost is
// further bounded by capMessageHistory (run-turn); per-IP/session rate limiting
// is an edge/WAF concern tracked separately on #973.
const MAX_BODY_BYTES = 256 * 1024;

async function handlePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  // Early reject on the declared size, but don't trust it — a chunked or
  // lying client can omit/understate Content-Length, so the real cap is
  // enforced on the bytes actually read below.
  const declaredBytes = Number(request.headers.get("content-length") ?? 0);
  if (declaredBytes > MAX_BODY_BYTES) {
    return jsonError("Request body too large", 413);
  }

  let messages: UIMessage[];
  let threadId: string;
  let runId: string | undefined;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return jsonError("Request body too large", 413);
    }
    const params = await chatParamsFromRequestBody(JSON.parse(raw));
    messages = params.messages as unknown as UIMessage[];
    // The client can't set the wire-level threadId (useChat doesn't forward
    // one), so it sends its session-stable id via forwardedProps. Prefer it —
    // it keeps the in-memory form session alive across page refreshes.
    const bodyThreadId = (params.forwardedProps as Record<string, unknown>)
      ?.threadId;
    threadId =
      typeof bodyThreadId === "string" && bodyThreadId
        ? bodyThreadId
        : params.threadId;
    runId = params.runId;
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "Invalid chat request body";
    return jsonError(reason, 400);
  }

  const env = getServerEnv();
  const result = await runTurn({
    messages,
    threadId,
    runId,
    signal: request.signal,
    ragUrl: env.RAG_URL,
    model: env.LLM_MODEL,
  });

  if (result.kind === "blocked") {
    // Deliver the refusal as a normal streamed assistant message (200), not an
    // HTTP error — the user sees the polite message, not a generic error pill,
    // and the LLM was never invoked. See blockedMessageStream.
    return toServerSentEventsResponse(
      blockedMessageStream(result.message, {
        runId,
        threadId,
        model: env.LLM_MODEL,
      }),
      { abortController: new AbortController() },
    );
  }

  return toServerSentEventsResponse(result.stream, {
    abortController: result.abortController,
  });
}

async function handlePostSafely(request: Request): Promise<Response> {
  try {
    return await handlePost({ request });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[api.chat] unhandled:", e);
    // Only expose error details in development — never leak internals (message,
    // name, stack) to clients in production.
    if (import.meta.env.DEV) {
      return new Response(
        JSON.stringify({
          error: e.message,
          name: e.name,
          stack: e.stack?.split("\n").slice(0, 8).join("\n"),
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
    return jsonError("Internal server error", 500);
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handlePostSafely(request),
    },
  },
});
