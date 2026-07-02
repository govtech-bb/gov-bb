import { createFileRoute } from "@tanstack/react-router";
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { bedrockText, type BedrockConverseModels } from "@tanstack/ai-bedrock";
import { resolveBedrockModelId } from "@govtech-bb/ai-bedrock";
import { mockTextAdapter } from "#/lib/chat/mock-adapter";
import { getServerEnv } from "#/config/env";
import {
  CLOSER_INSTRUCTION,
  FEEDBACK_INSTRUCTION,
  FORMS_INSTRUCTION,
  handoffLinkInstruction,
  OFFER_INSTRUCTION,
  SYSTEM_PROMPT,
} from "#/lib/chat/system-prompt";
import { turnLogMiddleware } from "#/lib/chat/middleware/turn-log";
import {
  lastAssistantText,
  lastUserText,
  type ChatMessage,
} from "#/lib/chat/messages";
import {
  buildCitedContext,
  buildSystemPrompts,
  isConversationalCloser,
  isGreetingOrTooShort,
  type CitedContext,
} from "#/lib/chat/grounding";
import { citationsMiddleware } from "#/lib/chat/middleware/citations";
import { getFeatures, isRagOnly } from "#/config/features";
import { buildChatTools } from "#/lib/chat/tools";
import { withStreamTimeout } from "#/lib/chat/stream-timeout";
import { staticAnswerStream } from "#/lib/chat/static-stream";
import { looksLikeJailbreak } from "#/lib/chat/guards";
import { rewriteRetrievalQuery } from "#/lib/chat/rewrite";
import { search } from "#/lib/rag/retrieve";
import { selectHandoff } from "#/lib/forms/handoff";
import { formMode } from "#/lib/forms/policy";
import { hasDatabase } from "#/lib/db";
import { logger } from "#/lib/observability/logger";
import type { Handoff, RetrieveResponse } from "#/lib/rag/types";

// POST /api/chat — runs one assistant turn through a guarded pipeline: jailbreak
// and closer/greeting shortcuts first, then retrieve + ground the question
// (RAG), assemble the system prompts, tools and any form handoff link, and
// stream the model's reply as SSE — with citations and turn logging riding along
// as middleware. Under LLM_MOCK a scripted adapter replaces Bedrock, and with no
// DB / RAG-only it degrades to a static answer rather than failing the turn.
interface Grounding {
  systemPrompts: string[];
  cited: CitedContext | null;
  handoff: Handoff | null;
  /** Retrieval was attempted but threw, so we grounded on no context. */
  degraded?: boolean;
}

// Fixed reply for a blocked (jailbreak) turn. Preserved verbatim from the
// existing assistant copy.
const JAILBREAK_REDIRECT =
  "I can only help with Barbados government services on alpha.gov.bb. Please rephrase your question around that.";

// The grounding stage: skip retrieval for greetings/too-short; otherwise fold
// the conversation into a standalone query, retrieve in-process, and build the
// cited context. Retrieval failures degrade to "no context" (abstain) rather
// than erroring the turn. Returns the per-turn system prompts + the cited
// context (citations + link tokens) for the citations middleware to emit.
async function ground(
  messages: ChatMessage[],
  signal: AbortSignal,
  landingUrl: string,
  formsEnabled: boolean,
  mock: boolean,
): Promise<Grounding> {
  // Mock mode (E2E): the scripted adapter drives a forms loop, not RAG — skip
  // retrieval entirely so a test run needs no model, embeddings, or vector DB.
  if (mock) {
    return { systemPrompts: [SYSTEM_PROMPT], cited: null, handoff: null };
  }
  const latest = lastUserText(messages);
  // Wind-down ("thanks, bye") → warm sign-off, not retrieval/abstention.
  if (isConversationalCloser(latest, lastAssistantText(messages))) {
    return {
      systemPrompts: [SYSTEM_PROMPT, CLOSER_INSTRUCTION],
      cited: null,
      handoff: null,
    };
  }
  if (isGreetingOrTooShort(latest) || !hasDatabase()) {
    return { systemPrompts: [SYSTEM_PROMPT], cited: null, handoff: null };
  }

  const query = await rewriteRetrievalQuery(messages, signal);
  let result: RetrieveResponse = { contexts: [], sources: [] };
  let degraded = false;
  try {
    result = await search(query);
  } catch (err) {
    degraded = true;
    logger.warn("retrieve.degraded", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  // Surface formIds in the cited block only when in-chat forms are enabled, so
  // the model can call getFormDefinition with the right id; the grounding used
  // for answering questions is unchanged.
  const cited = buildCitedContext(
    result.contexts,
    result.sources,
    landingUrl,
    formsEnabled,
  );
  // Handoff: a metadata-derived "Start now" link for the primary service.
  // NOT feature-flagged — pointing to a service's official start page is
  // baseline helpfulness. The policy map decides per-service whether to surface
  // it (selectHandoff → null unless approved + has a start page). The
  // features.forms flag is for INLINE collection of form answers, a different
  // capability.
  const handoff = selectHandoff(result.sources);
  return { systemPrompts: buildSystemPrompts(cited), cited, handoff, degraded };
}

// Max accepted request body. Generous for legitimate chat history but rejects
// oversized payloads before they're parsed. Per-IP/session rate limiting is an
// edge/WAF concern, not handled here.
const MAX_BODY_BYTES = 256 * 1024;

const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });

// Streaming chat route, following the standard TanStack AI pipeline:
// early-abort guard → parse body with `chatParamsFromRequestBody` → build a
// stream with `chat({ adapter, messages, systemPrompts, abortController })` →
// return via `toServerSentEventsResponse`. We supply our own adapter
// (`bedrockText`).
async function handlePost(request: Request): Promise<Response> {
  // Client already gone before we started — don't spin up a model call.
  if (request.signal.aborted) return new Response(null, { status: 499 });

  // Early reject on the declared size, but don't trust it — a chunked or lying
  // client can omit/understate Content-Length, so the real cap is enforced on
  // the bytes actually read below.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonError("Request body too large", 413);
  }

  let params;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return jsonError("Request body too large", 413);
    }
    params = await chatParamsFromRequestBody(JSON.parse(raw));
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "Invalid chat request body";
    return jsonError(reason, 400);
  }

  const env = getServerEnv();
  // The in-chat form features (forms / feedback / offers) are resolved here and
  // gate the tool merge below — all default OFF, so by default the assistant
  // only answers questions from retrieved content. RAG_ONLY forces them off
  // wholesale. Today the gated tool set is empty; enabling these flags is what
  // registers the form tools.
  const features = getFeatures(env);
  const startedAt = Date.now();
  const abortController = new AbortController();
  // The framework aborts on client disconnect via the SSE stream's `cancel()`
  // hook — but only once the stream exists. Our grounding stage runs *before*
  // that, so bridge request.signal here too: a disconnect during grounding then
  // aborts the rewrite call. (Retrieval itself takes no signal — it's bounded by
  // the DB statement/connection timeouts in lib/db, not by this abort.)
  request.signal.addEventListener("abort", () => abortController.abort());

  const messages = params.messages as ChatMessage[];
  const userText = lastUserText(messages);

  // Obvious prompt-injection / jailbreak attempts are answered with a fixed
  // redirect, before the model (or retrieval) is ever invoked.
  if (looksLikeJailbreak(userText)) {
    logger.warn("chat.blocked", {
      threadId: params.threadId,
      reason: "jailbreak",
    });
    return toServerSentEventsResponse(
      staticAnswerStream(JAILBREAK_REDIRECT, {
        threadId: params.threadId,
        runId: params.runId,
        model: env.LLM_MODEL,
      }),
    );
  }

  try {
    // Grounding: rewrite → in-process retrieve → cited context block →
    // abstention, composed onto the system prompts. (Citations from the cited
    // context are surfaced to the client by the citations middleware below.)
    const { systemPrompts, cited, handoff, degraded } = await ground(
      messages,
      abortController.signal,
      env.LANDING_URL,
      features.forms,
      env.LLM_MOCK,
    );
    // In-chat form tools, gated by feature flags — empty when the flags are off
    // (answering questions only). The agent loop only runs when tools exist, so
    // a plain question-answering turn is unchanged. Collection (forms or
    // feedback) appends the protocol; feedback + offers add their own guidance
    // on top.
    const tools = buildChatTools(features);
    // A link-only (handoff) service can't be completed in chat, so it must never
    // get the "fill it in with you here" offer — just the inline link.
    const handoffLinkOnly = !!handoff && formMode(handoff.formId) === "handoff";
    const prompts = [...systemPrompts];
    // Handoff link is baseline (not feature-gated): when a service with an online
    // form was retrieved, give the model the link to weave into its reply.
    if (handoff) {
      prompts.push(
        handoffLinkInstruction(
          handoff.title,
          handoff.startUrl,
          handoffLinkOnly,
        ),
      );
    }
    if (features.forms || features.feedback) prompts.push(FORMS_INSTRUCTION);
    if (features.feedback) prompts.push(FEEDBACK_INSTRUCTION);
    // Offers (progressive disclosure + "apply now?" pills) — suppressed for a
    // link-only service so the model doesn't offer to fill in a form that can't
    // be completed here.
    if (features.offers && !handoffLinkOnly) prompts.push(OFFER_INSTRUCTION);
    const adapter = env.LLM_MOCK
      ? mockTextAdapter(env.LLM_MODEL, env.LLM_MOCK_FORM)
      : bedrockText(
          resolveBedrockModelId(env.LLM_MODEL) as BedrockConverseModels,
          { region: env.BEDROCK_REGION },
        );
    const stream = chat({
      adapter,
      messages: params.messages,
      systemPrompts: prompts,
      modelOptions: { max_completion_tokens: 600, temperature: 0 },
      ...(tools.length ? { tools, agentLoopStrategy: maxIterations(8) } : {}),
      threadId: params.threadId,
      runId: params.runId,
      abortController,
      middleware: [
        // Emit citations + link tokens as a CUSTOM event. (The form handoff link
        // is woven into the model's prose via handoffLinkInstruction, not here.)
        ...(cited?.citations.length
          ? [
              citationsMiddleware(
                cited?.citations ?? [],
                cited?.linkTokens ?? {},
              ),
            ]
          : []),
        turnLogMiddleware(
          {
            threadId: params.threadId,
            runId: params.runId,
            model: env.LLM_MODEL,
            userChars: userText.length,
            mode: isRagOnly(features) ? "rag" : "assist",
            retrieveDegraded: degraded,
            query: import.meta.env.DEV ? userText.slice(0, 120) : undefined,
          },
          startedAt,
        ),
      ],
    });
    return toServerSentEventsResponse(
      withStreamTimeout(stream, abortController, env.TURN_TIMEOUT_MS),
      { abortController },
    );
  } catch (err) {
    if (
      (err as Error)?.name === "AbortError" ||
      abortController.signal.aborted
    ) {
      return new Response(null, { status: 499 });
    }
    logger.error("chat.unhandled", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handlePost(request),
    },
  },
});
