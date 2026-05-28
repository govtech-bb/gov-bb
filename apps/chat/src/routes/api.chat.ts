import { createFileRoute } from "@tanstack/react-router";
import type { CustomEvent, StreamChunk, UIMessage } from "@tanstack/ai";
import {
  EventType,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { getServerEnv } from "#/config/env";
import { runTurn } from "#/lib/chat/run-turn";
import type { Citation } from "#/lib/chat/types";
import { jsonError } from "#/lib/http";

// Emit the citations event right after the assistant message id is known
// (TEXT_MESSAGE_START), so the client can store citations keyed by messageId
// instead of by stream index.
async function* withCitations(
  inner: AsyncIterable<StreamChunk>,
  citations: Citation[],
): AsyncGenerator<StreamChunk> {
  let emitted = false;
  if (citations.length === 0) {
    yield* inner;
    return;
  }
  for await (const chunk of inner) {
    yield chunk;
    if (emitted) continue;
    if (chunk.type === "TEXT_MESSAGE_START" && chunk.messageId) {
      yield citationsEvent(chunk.messageId, citations);
      emitted = true;
    } else if (chunk.type === "RUN_FINISHED") {
      // Tool-only turn: no TEXT_MESSAGE_START arrived. Emit unkeyed so the
      // client can attach citations to the run rather than a message.
      yield citationsEvent(undefined, citations);
      emitted = true;
    }
  }
}

function citationsEvent(
  messageId: string | undefined,
  citations: Citation[],
): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: "citations",
    value: { messageId, citations },
    timestamp: Date.now(),
  };
}

async function handlePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  let messages: UIMessage[];
  let threadId: string;
  let runId: string | undefined;
  try {
    const params = await chatParamsFromRequest(request);
    messages = params.messages as unknown as UIMessage[];
    threadId = params.threadId;
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
    return jsonError(result.message, result.status);
  }

  return toServerSentEventsResponse(
    withCitations(result.stream, result.citations),
    { abortController: result.abortController },
  );
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
