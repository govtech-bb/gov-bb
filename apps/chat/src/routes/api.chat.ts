import { createFileRoute } from "@tanstack/react-router";
import type { CustomEvent, StreamChunk, UIMessage } from "@tanstack/ai";
import {
  EventType,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { env } from "#/lib/env";
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
  for await (const chunk of inner) {
    yield chunk;
    if (
      !emitted &&
      citations.length > 0 &&
      chunk.type === "TEXT_MESSAGE_START" &&
      chunk.messageId
    ) {
      yield {
        type: EventType.CUSTOM,
        name: "citations",
        value: { messageId: chunk.messageId, citations },
        timestamp: Date.now(),
      } satisfies CustomEvent;
      emitted = true;
    }
  }
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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handlePost({ request }),
    },
  },
});
