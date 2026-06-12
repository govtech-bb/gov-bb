import type { StreamChunk, UIMessage } from "@tanstack/ai";
import { chat } from "@tanstack/ai";
import { bedrockText } from "@govtech-bb/ai-bedrock";
import { childController } from "#/lib/abort";
import { getServerEnv } from "#/config/env";
import { landingStartPath } from "#/lib/rag/start-page";
import {
  applyRagFallback,
  buildEndOfChatTools,
  buildFeedbackTools,
  buildFieldSpec,
  buildFormTools,
  buildOfferTools,
  consumeOfferReply,
  funnelPhase,
  getOrCreateSession,
  matchChangeField,
  matchFormsFromText,
  matchPendingOption,
  nextAskableField,
  nextRequiredAskableField,
  parkHandoff,
  pinSessionForm,
  recordMissOutcome,
  recordOptionValue,
  resetFieldForChange,
  resolveActiveForm,
  withThreadLock,
  type FormResolution,
  type FormTurnContext,
  type PinResult,
} from "./form";
import { representChoicesStream } from "./represent-choices-stream";
import { representFieldStream } from "./represent-field-stream";
import {
  cancelFeedbackForm,
  consumeFeedbackChoice,
  FEEDBACK_ABOUT_ASSISTANT,
  FEEDBACK_ABOUT_SERVICE,
  FEEDBACK_DISAMBIGUATION_QUESTION,
  FEEDBACK_FORM_ID,
  FEEDBACK_TRIGGER_PHRASE,
  shouldBindFeedbackOffer,
  shouldReleaseFeedbackOffer,
} from "./feedback";
import {
  isInfoQuestion,
  looksLikeFeedbackIntent,
  looksLikeJailbreak,
} from "./guards";
import { citationsMiddleware, turnLogMiddleware } from "./middleware";
import { capMessageHistory, lastAssistantText, lastUserText } from "./messages";
import { buildSystemPrompts } from "./prompt-builder";
import {
  buildCitedContext,
  isConversationalCloser,
  isGreetingOrTooShort,
  retrieve,
  topServiceCandidates,
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

  // A pending RAG offer resolves FIRST, deterministically: the choice pills
  // send their label verbatim, so "fill it here" pins the form and "just the
  // link" parks it — code, not model interpretation (ADR 0048). Any other
  // reply lapses the offer and falls through to normal routing.
  const offerReply = consumeOfferReply(session, latest);
  // Same link policy as resolveActiveForm's handoff: prefer the landing start
  // page over the bare forms-app URL, so an offer's "just send me the link"
  // matches what a handoff would have given.
  const offerStartPath =
    offerReply?.kind === "link"
      ? await landingStartPath(offerReply.slug)
      : null;
  const linkRequested =
    offerReply?.kind === "link"
      ? {
          title: offerReply.title,
          url: offerStartPath
            ? `${getServerEnv().LANDING_URL}${offerStartPath}`
            : `${getServerEnv().FORMS_URL}/forms/${encodeURIComponent(offerReply.slug)}`,
        }
      : undefined;

  // A pending feedback disambiguation resolves deterministically too (same
  // contract as the offer pills). "About this assistant" pins chat-feedback
  // here, so the normal collect-feedback flow takes over below; "About a service
  // or the site" sets serviceFeedback, which hands over the general feedback
  // form link and bypasses retrieval/matching for the rest of the turn.
  const feedbackChoice = consumeFeedbackChoice(session, latest);
  const serviceFeedback =
    feedbackChoice?.kind === "service"
      ? { url: `${getServerEnv().LANDING_URL}/feedback` }
      : undefined;

  // Explicit feedback intent on a no-form turn: ask ONE quick question — about
  // the assistant, or about a service / the site — as deterministic choice
  // pills, BEFORE the matcher can route a lingering service topic from the
  // rolling window. The tap is resolved next turn by consumeFeedbackChoice.
  // Gated so we don't hijack: only when no form is pinned coming in, this turn
  // isn't itself an offer/choice reply, and no choices are already pending
  // (feedbackChoice === null means none were on the table). The banner phrase is
  // already-scoped to the assistant, so it's excluded — it keeps pinning
  // chat-feedback directly via pinSessionForm (#1206).
  if (
    !serviceFeedback &&
    feedbackChoice === null &&
    offerReply === null &&
    !session.slug &&
    latest !== FEEDBACK_TRIGGER_PHRASE &&
    looksLikeFeedbackIntent(latest)
  ) {
    session.feedbackChoice = "pending";
    session.updatedAt = Date.now();
    return {
      kind: "ok",
      stream: representChoicesStream(
        FEEDBACK_DISAMBIGUATION_QUESTION,
        [FEEDBACK_ABOUT_ASSISTANT, FEEDBACK_ABOUT_SERVICE],
        { runId, threadId, model },
      ),
      abortController: childController(signal),
    };
  }

  // Was a form already active coming INTO this turn? Distinguishes a re-trigger
  // of the current form (banner clicked again) from a first activation.
  const pinnedBefore = session.slug;

  // serviceFeedback short-circuits matching: the user deliberately asked for the
  // general feedback link, so don't let the rolling-window matcher re-pin a
  // service topic and override it. When the matcher finds the request names
  // several forms about equally well it pins NONE and hands the titles back, so
  // the disambiguation below can ask which one instead of guessing (#1296).
  const pinResult: PinResult = serviceFeedback
    ? {}
    : await pinSessionForm(session, messages);
  const matcherAmbiguousTitles = pinResult.ambiguousTitles;

  let resolution: FormResolution =
    !serviceFeedback && session.slug
      ? await resolveActiveForm(session.slug, session.values)
      : { kind: "none" };
  const retrievalBoostSlug = session.slug ?? undefined;

  // Handoff carries no in-progress state. Don't pin the session to it, or the
  // user stays stuck getting the same handoff link on every later turn. Park
  // it so the matcher above won't immediately re-hand-off the same form.
  if (resolution.kind === "handoff") {
    parkHandoff(session, session.slug);
  }

  // DETERMINISTIC FORM INTERACTIONS (no model in the loop). Option clicks and
  // form re-triggers are unambiguous UI actions; routing their plain-text label
  // through the model is what made "Okay" read as chit-chat and made a repeated
  // banner click re-prompt in prose. Handle them in code instead, re-rendering
  // the field via the same ask_field tool-result the model path emits.
  if (resolution.kind === "collect") {
    const form = resolution.form;
    // (1) The user picked an option for the current choice question — record it
    // ourselves, then deterministically present the next field. Only when there
    // IS a next field; once all are presented, fall through so the model runs
    // review_form/submit_form (the approval flow it owns).
    const answer = matchPendingOption(form, session, latest);
    if (answer && recordOptionValue(form, session, answer)) {
      const next = nextAskableField(
        form.contract,
        session.values,
        session.askedFieldIds,
      );
      if (next) {
        session.askedFieldIds.add(next.field.fieldId);
        return {
          kind: "ok",
          stream: representFieldStream(
            buildFieldSpec(
              form.contract,
              next.field,
              session.values,
              session.askedFieldIds,
            ),
            { runId, threadId, model },
          ),
          abortController: childController(signal),
          activeFormSlug: session.slug ?? undefined,
        };
      }
    } else if (pinnedBefore === session.slug) {
      // (2) The user clicked "Change" on a check-your-answers row — re-present
      // that one field deterministically. Routing it through the model made it
      // emit present_choices AND ask_field for the same field, rendering the
      // question twice (#1255). Reset the field (keeping it presented, so a
      // re-picked choice is recorded by the option path above; a free-text
      // re-answer falls to the model), then re-render it.
      const change = matchChangeField(form, session, latest);
      if (change) {
        resetFieldForChange(session, change.field.fieldId);
        session.askedFieldIds.add(change.field.fieldId);
        return {
          kind: "ok",
          stream: representFieldStream(
            buildFieldSpec(
              form.contract,
              change.field,
              session.values,
              session.askedFieldIds,
            ),
            { runId, threadId, model },
          ),
          abortController: childController(signal),
          activeFormSlug: session.slug ?? undefined,
        };
      }
      // (3) The user re-invoked the form they're already in (e.g. the banner
      // "Give feedback" link clicked again) with a REQUIRED question still
      // unanswered — re-render that question and its options. Gated on a real
      // re-match of the active form so a field answer or a side question can't
      // trip it.
      const pending = nextRequiredAskableField(
        form.contract,
        session.values,
        session.askedFieldIds,
      );
      if (
        pending &&
        (await matchFormsFromText(latest))?.formId === session.slug
      ) {
        session.askedFieldIds.add(pending.field.fieldId);
        return {
          kind: "ok",
          stream: representFieldStream(
            buildFieldSpec(
              form.contract,
              pending.field,
              session.values,
              session.askedFieldIds,
            ),
            { runId, threadId, model },
          ),
          abortController: childController(signal),
          activeFormSlug: session.slug ?? undefined,
        };
      }
    }
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
  // Offer replies are clicks on known affordances — nothing to ground.
  const skipRetrieval =
    isGreetingOrTooShort(latest) ||
    (activelyCollecting && !isInfoQuestion(latest)) ||
    offerReply !== null ||
    serviceFeedback !== undefined ||
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
  // The rewrite also classifies intent (info vs apply). Skipped turns
  // (greeting / actively collecting) default to "apply" — the link-preserving
  // default.
  const rewrite = skipRetrieval
    ? { query: latest, intent: "apply" as const }
    : await rewriteRetrievalQuery(messages, signal);
  const query = rewrite.query;
  const intent = rewrite.intent;

  const { contexts, rawSources, degraded } = await fetchContext(
    ragUrl,
    query,
    skipRetrieval,
    signal,
    retrievalBoostSlug,
  );

  const {
    block: contextBlock,
    citations,
    linkTokens,
  } = buildCitedContext(
    contexts,
    rawSources,
    query,
    getServerEnv().LANDING_URL,
  );

  // A zero-value chat-feedback pin is an open offer, not active collection — but
  // a pinned form suppresses the RAG routing backstop below. If this turn's
  // retrieval surfaced a real service, the user changed topic (the title matcher
  // misses natural phrasings, e.g. "conductor license", and a non-question never
  // tripped the pinSessionForm release), so release the pin and let the normal
  // no-form path route to that service (#1202). cancelFeedbackForm preserves
  // feedbackOffered, and re-asserting it keeps the never-re-offer invariant: a
  // topic switch reads as an implicit decline.
  const serviceCandidatesRaw = topServiceCandidates(rawSources);
  if (
    shouldReleaseFeedbackOffer(
      resolution,
      Object.keys(session.values).length,
      serviceCandidatesRaw.length > 0,
    )
  ) {
    cancelFeedbackForm(session);
    session.feedbackOffered = true;
    resolution = { kind: "none" };
  }

  // Server-driven disambiguation (ADR 0048, stage 3): when retrieval covers
  // SEVERAL distinct services and no form is pinned, winner-take-all routing
  // would guess — narrow with clickable choices instead. Suppresses the RAG
  // fallback for the turn (its top-1 pick is exactly the guess we're
  // avoiding). The disclosure keeps a model escape hatch for follow-ups
  // whose topic the conversation already established.
  const serviceCandidates =
    resolution.kind === "none" && !session.slug ? serviceCandidatesRaw : [];
  // Prefer the title matcher's tied set when it has one: the user's wording
  // lexically named several forms (a high-signal ambiguity), so disambiguate on
  // those exact forms rather than the fuzzier RAG service candidates (#1296).
  // A matcher tie pins nothing, so resolution is "none" and the session stays
  // unpinned — the same gating the RAG path relies on.
  const disambiguation =
    matcherAmbiguousTitles && matcherAmbiguousTitles.length >= 2
      ? { titles: matcherAmbiguousTitles }
      : serviceCandidates.length >= 2
        ? { titles: serviceCandidates.map((c) => c.title) }
        : undefined;

  const ragFallback = disambiguation
    ? { resolution }
    : await applyRagFallback(resolution, session, rawSources, signal);
  resolution = ragFallback.resolution;
  const handoffContinuation = ragFallback.handoffContinuation;
  const formOffer = ragFallback.formOffer;
  const unapprovedForm = ragFallback.unapprovedForm ?? false;

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
  // NO_FORM_DISCLOSURE (#1099).
  const noContext = citations.length === 0 && !skipRetrieval;

  // Clarify ONCE on a miss, then disclose we can't help instead of re-asking
  // turn over turn (#1176). recordMissOutcome tracks consecutive misses on the
  // session: the first miss clarifies, the second+ consecutive miss exhausts
  // the clarify and switches to the can't-help disclosure. A non-miss turn
  // resets the streak. Skipped turns (greeting / closer / active collection)
  // are not misses, so they reset it too.
  const { clarifyExhausted: missClarifyExhausted } = recordMissOutcome(
    session,
    noContext,
  );

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
    !formOffer &&
    !linkRequested &&
    !serviceFeedback &&
    !disambiguation &&
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
    formOffer,
    linkRequested,
    serviceFeedback,
    disambiguation,
    unapprovedForm,
    noContext,
    missClarifyExhausted,
    offerFeedback,
    closer,
  });

  // The turn ACTION decides which tools the model gets — it cannot upgrade
  // an offer into collection (no field tools bound) or collect outside an
  // active form. The action is code-derived; the model only executes it
  // conversationally (ADR 0048).
  //   collect           → full field tools
  //   collect-feedback  → field tools + decline_feedback
  //   offer-start       → present_choices ONLY (matcher offerOnly + RAG offer)
  //   feedback-offer    → offer_feedback only
  //   none              → no tools
  const action =
    resolution.kind === "collect"
      ? offerOnly
        ? "offer-start"
        : resolution.form.slug === FEEDBACK_FORM_ID
          ? "collect-feedback"
          : "collect"
      : formOffer || disambiguation
        ? "offer-start"
        : offerFeedback
          ? "feedback-offer"
          : "none";
  const TOOLSETS = {
    collect: buildFormTools,
    "collect-feedback": buildFeedbackTools,
    "offer-start": buildOfferTools,
    "feedback-offer": buildEndOfChatTools,
    none: () => [],
  } as const;
  const tools = TOOLSETS[action]();
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
      citationsMiddleware(citations, linkTokens),
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
          action,
          phase: funnelPhase(session),
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
