import type { StreamChunk, UIMessage } from "@tanstack/ai";
import { chat } from "@tanstack/ai";
import { bedrockText } from "@govtech-bb/ai-bedrock";
import { childController } from "#/lib/abort";
import { getServerEnv } from "#/config/env";
import {
  applyRagFallback,
  buildEndOfChatTools,
  buildFeedbackTools,
  buildFormTools,
  buildOfferTools,
  getOrCreateSession,
  pinSessionForm,
  resolveActiveForm,
  withThreadLock,
  type FormResolution,
  type FormTurnContext,
} from "./form";
import { FEEDBACK_FORM_ID, shouldBindFeedbackOffer } from "./feedback";
import { isInfoQuestion, looksLikeJailbreak } from "./guards";
import { citationsMiddleware, turnLogMiddleware } from "./middleware";
import { capMessageHistory, lastAssistantText, lastUserText } from "./messages";
import { buildSystemPrompts } from "./prompt-builder";
import {
  buildCitedContext,
  isConversationalCloser,
  isGreetingOrTooShort,
  retrieve,
} from "./retrieval";
import { rewriteRetrievalQuery } from "./rewrite";
import type { RetrievedContext, Source } from "./types";

export interface RunTurnInput {
  messages: UIMessage[];
  threadId: string;
  runId?: string;
  signal: AbortSignal;
  ragUrl: string;
  model: string;
}

export type RunTurnResult =
  | { kind: "blocked"; message: string }
  | {
      kind: "ok";
      stream: AsyncIterable<StreamChunk>;
      abortController: AbortController;
      activeFormSlug?: string;
    };

export async function runTurn(input: RunTurnInput): Promise<RunTurnResult> {
  // Serialize concurrent runs for the same thread so set_field writes don't
  // interleave and session.status transitions stay coherent.
  return withThreadLock(input.threadId, () => runTurnInner(input));
}

async function runTurnInner(input: RunTurnInput): Promise<RunTurnResult> {
  const { threadId, runId, signal, ragUrl, model } = input;
  // Bound per-call token cost / cost-DoS: only the most recent turns reach the
  // LLM. Safe because form-collection state lives server-side, not in history.
  const messages = capMessageHistory(input.messages);
  const startedAt = Date.now();
  const latest = lastUserText(messages);

  if (looksLikeJailbreak(latest)) {
    console.warn(`[chat] jailbreak blocked: ${latest.slice(0, 80)}`);
    return {
      kind: "blocked",
      message:
        "I can only help with Barbados government services on alpha.gov.bb. Please rephrase your question around that.",
    };
  }

  const session = getOrCreateSession(threadId);
  await pinSessionForm(session, messages);

  let resolution: FormResolution = session.slug
    ? await resolveActiveForm(session.slug, session.values)
    : { kind: "none" };
  const retrievalBoostSlug = session.slug ?? undefined;

  // Handoff carries no in-progress state. Don't pin the session to it, or the
  // user stays stuck getting the same handoff link on every later turn. Record
  // it so the matcher above won't immediately re-hand-off the same form.
  if (resolution.kind === "handoff") {
    session.handedOffSlug = session.slug;
    session.slug = null;
  }

  // Skip the rewrite LLM call and RAG retrieval only once the user is ACTIVELY
  // collecting (we've already captured at least one field) — there they're
  // answering field prompts, not asking knowledge questions, so retrieval is
  // dead weight. On the FIRST turn a form is merely matched (no values yet) the
  // user is often asking an info question ("what's the cost?"), so we must keep
  // retrieval ON — otherwise grounded answers about form-backed services
  // vanish and the chat jumps straight to collecting (inconsistent UX where the
  // same question sometimes answers, sometimes form-fills).
  const activelyCollecting =
    resolution.kind === "collect" && Object.keys(session.values).length > 0;

  // A conversational closer ("thanks, bye", or "no"/"ok" right after we asked
  // "anything else?") winds the chat down. Detected here so the turn routes to a
  // warm sign-off + feedback invitation rather than being mistaken for a
  // retrieval miss (a closer and a miss BOTH return zero citations — #1125).
  // Gated to non-collect turns: while a form is active, a terse "no"/"ok" is a
  // field answer, not a goodbye. Skips retrieval — there's nothing to ground.
  const closer =
    resolution.kind !== "collect" &&
    isConversationalCloser(latest, lastAssistantText(messages));
  // Mid-collection, most turns are field answers ("Aaron", "1990-05-04",
  // "Yes") — retrieval is dead weight there. But a QUESTION mid-form ("how
  // much does this cost?", "what documents do I need?") must stay grounded:
  // skipping retrieval left the model answering service questions from
  // nothing. retrievalBoostSlug keeps the active form's own pages on top.
  const skipRetrieval =
    isGreetingOrTooShort(latest) ||
    (activelyCollecting && !isInfoQuestion(latest)) ||
    closer;

  // A form matched on an INFO question (nothing collected yet, the message is a
  // question rather than apply-intent): answer from RAG and offer the form, but
  // do NOT register the field-collection tools — so the model can't silently
  // start field-prompting on a question. This makes "do you get an answer or a
  // form prompt" deterministic instead of matcher/model dependent. Apply-intent
  // ("I want to apply", "yes, start it") is not a question, so it enters collect.
  const offerOnly =
    resolution.kind === "collect" &&
    Object.keys(session.values).length === 0 &&
    isInfoQuestion(latest);
  // The rewrite also classifies intent (info vs apply) and flags fraud/bribery-
  // framed requests. Skipped turns (greeting / actively collecting) default to
  // "apply" + legitimate — the link-preserving, no-false-refusal defaults.
  const rewrite = skipRetrieval
    ? { query: latest, intent: "apply" as const, illegitimate: false }
    : await rewriteRetrievalQuery(messages, signal);
  const query = rewrite.query;
  const intent = rewrite.intent;

  // Fraud / bribery / falsification-framed request: NEVER offer a form. A
  // bribery ask ("how much to pay to get my child into a better school") can
  // match a legitimate form (school choice) and the offer path would then
  // helpfully present it. Neutralise any matched form and skip the RAG-driven
  // handoff below, so the model declines per the ILLEGITIMATE REQUESTS section
  // of the system prompt (optionally naming the legitimate route) instead.
  if (rewrite.illegitimate) {
    resolution = { kind: "none" };
    session.slug = null;
  }

  const { contexts, rawSources, degraded } = await fetchContext(
    ragUrl,
    query,
    skipRetrieval,
    signal,
    retrievalBoostSlug,
  );

  const { block: contextBlock, citations } = buildCitedContext(
    contexts,
    rawSources,
    query,
  );

  const ragFallback = await applyRagFallback(
    resolution,
    session,
    rawSources,
    rewrite.illegitimate,
    signal,
  );
  resolution = ragFallback.resolution;
  const handoffContinuation = ragFallback.handoffContinuation;
  const ragCollectLink = ragFallback.ragCollectLink;

  // Info-intent on a handoff service: buildSystemPrompts offers the link in
  // prose instead of pushing it. We deliberately leave the form PARKED (as the
  // matcher/RAG paths above did, handedOffSlug set) rather than pinning it —
  // pinning would skip the matcher next turn and trap the user on this form if
  // they switch topics. The existing continuation path delivers the link on an
  // affirmative follow-up: the rewrite expands "yes, send it" via history into a
  // retrievable query, which re-surfaces the parked handoff as a continuation.

  // A genuine retrieval miss: we actually queried RAG (not a greeting / active
  // collection) and it returned no grounded context (zero citations). Route the
  // miss disclosure (keep guiding, ask to clarify) instead of the misapplied
  // NO_FORM_DISCLOSURE. Illegitimate requests are excluded so they stay on the
  // existing decline path rather than being invited to "clarify" (#1099).
  const noContext =
    citations.length === 0 && !skipRetrieval && !rewrite.illegitimate;

  // No active form, feedback not yet offered, and not parked mid-handoff:
  // expose offer_feedback so the model can invite feedback at a natural stop.
  // A retrieval miss (noContext) is never a natural stop — the user asked
  // something we couldn't answer and we're asking them to clarify — so it
  // suppresses the offer too.
  const offerFeedback =
    shouldBindFeedbackOffer(
      resolution.kind,
      session.feedbackOffered ?? false,
    ) &&
    !handoffContinuation &&
    !ragCollectLink &&
    !rewrite.illegitimate &&
    !noContext;

  const env = getServerEnv();
  const systemPrompts = buildSystemPrompts({
    contextBlock,
    resolution,
    session,
    formsUrl: env.FORMS_URL,
    handoffContinuation,
    offerOnly,
    intent,
    ragCollectLink,
    noContext,
    offerFeedback,
    closer,
  });

  // collect + apply-intent → full field tools. collect + info question
  // (offerOnly) → present_choices ONLY, so the model offers a clickable "Start
  // the application" affordance rather than a dead-end prose "want to start?",
  // but still can't silently record fields on a question. Anything else → none.
  // The field tools read session/form/signal from chat()'s runtime context.
  const tools =
    resolution.kind === "collect"
      ? offerOnly
        ? buildOfferTools()
        : resolution.form.slug === FEEDBACK_FORM_ID
          ? buildFeedbackTools()
          : buildFormTools()
      : offerFeedback
        ? buildEndOfChatTools()
        : [];
  const formContext: FormTurnContext = {
    session,
    form: resolution.kind === "collect" ? resolution.form : null,
    signal,
  };

  const abortController = childController(signal);

  const stream = chat({
    adapter: bedrockText(model, {
      region: env.BEDROCK_REGION,
      cacheSystemPrompt: env.BEDROCK_PROMPT_CACHE,
    }),
    messages,
    systemPrompts,
    tools,
    context: formContext,
    modelOptions: { maxTokens: 600, temperature: 0 },
    abortController,
    middleware: [
      citationsMiddleware(citations),
      turnLogMiddleware(
        {
          ts: new Date().toISOString(),
          threadId,
          runId,
          model: String(model),
          userChars: latest.length,
          query: activelyCollecting ? undefined : latest.slice(0, 120),
          retrieved: rawSources.map((s) => ({ id: s.id, score: s.score })),
          formSlug: session.slug ?? undefined,
          retrieveDegraded: degraded,
        },
        startedAt,
      ),
    ],
    // DEV: full engine trace. PROD: `undefined` keeps the errors-only channel
    // (`false` silences adapter failure logs too). Never `true` in prod — the
    // full trace logs message content (CloudWatch cost + PII).
    debug: import.meta.env.DEV ? true : undefined,
  });

  return {
    kind: "ok",
    stream,
    abortController,
    activeFormSlug: session.slug ?? undefined,
  };
}

async function fetchContext(
  ragUrl: string,
  query: string,
  skip: boolean,
  signal: AbortSignal,
  boostSlug?: string,
): Promise<{
  contexts: RetrievedContext[];
  rawSources: Source[];
  degraded: boolean;
}> {
  if (skip) return { contexts: [], rawSources: [], degraded: false };
  const result = await retrieve(ragUrl, query, signal, { boostSlug });
  if (!result.ok) {
    console.warn(`[chat] retrieve degraded: ${result.reason}`);
    return { contexts: [], rawSources: [], degraded: true };
  }
  return {
    contexts: result.data.contexts,
    rawSources: result.data.sources,
    degraded: false,
  };
}
