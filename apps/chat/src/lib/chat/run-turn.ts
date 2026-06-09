import type { StreamChunk, SystemPrompt, UIMessage } from "@tanstack/ai";
import { chat } from "@tanstack/ai";
import { bedrockText } from "@govtech-bb/ai-bedrock";
import { childController } from "#/lib/abort";
import { getServerEnv } from "#/config/env";
import {
  buildFormTools,
  buildOfferTools,
  getFormSlugs,
  getOrCreateSession,
  resolveActiveForm,
  matchFormsFromText,
  resetSessionForNewForm,
  withThreadLock,
  type FormResolution,
  type FormSession,
} from "./form";
import { citationsMiddleware, turnLogMiddleware } from "./middleware";
import { capMessageHistory, lastUserText, recentUserText } from "./messages";
import {
  NO_FORM_DISCLOSURE,
  SYSTEM_PROMPT,
  buildHandoffContinuationDisclosure,
  buildHandoffDisclosure,
  buildHandoffOfferDisclosure,
  buildSchemaDisclosure,
} from "./prompts";
import {
  buildCitedContext,
  decideRagFallback,
  isGreetingOrTooShort,
  retrieve,
  topHandoffCandidateSlug,
} from "./retrieval";
import { rewriteRetrievalQuery } from "./rewrite";
import type { RetrievedContext, Source } from "./types";

type SystemEntry = SystemPrompt<never>;

export interface RunTurnInput {
  messages: UIMessage[];
  threadId: string;
  runId?: string;
  signal: AbortSignal;
  ragUrl: string;
  model: string;
}

export type RunTurnResult =
  | { kind: "blocked"; status: number; message: string }
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
      status: 400,
      message:
        "I can only help with Barbados government services on alpha.gov.bb. Please rephrase your question around that.",
    };
  }

  const session = getOrCreateSession(threadId);
  if (!session.slug || session.status === "submitted") {
    const windowMatch = await matchFormsFromText(recentUserText(messages));
    // A handed-off form (file upload / payment) isn't pinned to the session,
    // so it re-enters matching from the rolling window. If the window still
    // points at the form we just handed off, defer to what the user's LATEST
    // message matches (possibly nothing) so they aren't re-handed the same
    // link turn after turn, and a genuine topic switch still activates.
    const matched =
      windowMatch && windowMatch.formId === session.handedOffSlug
        ? await matchFormsFromText(lastUserText(messages))
        : windowMatch;
    if (matched) {
      if (matched.formId !== session.slug) resetSessionForNewForm(session);
      session.slug = matched.formId;
    }
  }

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
  const skipRetrieval = isGreetingOrTooShort(latest) || activelyCollecting;

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
  // The rewrite also classifies intent (info vs apply). Skipped turns (greeting
  // / actively collecting) default to "apply" — the link-preserving default.
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

  const { block: contextBlock, citations } = buildCitedContext(
    contexts,
    rawSources,
    query,
  );

  // RAG-driven handoff (and its follow-up continuation). The title-token matcher
  // above only fires when the user's wording overlaps a form title (e.g.
  // "conductor licence"). When it didn't pin a form, fall back to the top
  // retrieved service — if it maps to a published form that must be completed in
  // the forms app (file upload / payment), surface that link rather than a plain
  // informational answer. This is what makes phrasings like "how do I become a
  // conductor" reach the conductor application.
  //
  // Scoped to kind "none" && !session.slug: never upgrades a matched collectible
  // form, and never fires when a pinned form merely failed to resolve (a
  // transient form-API blip can't redirect the user elsewhere). It also means
  // the matcher block above ran this turn, so the form index is warm-cached.
  let handoffContinuation: { title: string; url: string } | undefined;
  // Compute a candidate only when no form is pinned (the gates fold into here):
  // "none" so we never override a matched collectible form, and !session.slug so
  // a pinned form that merely failed to resolve can't be redirected elsewhere.
  const ragCandidate =
    resolution.kind === "none" && !session.slug
      ? topHandoffCandidateSlug(rawSources)
      : null;
  // Resolve against the forms API only when there's a candidate, and gate on the
  // form index (warm-cached from the matcher this turn) so a retrieved info-only
  // service with no published form doesn't trigger a doomed form-definition
  // fetch and a 404 warning every turn.
  let ragResolution: FormResolution = { kind: "none" };
  if (ragCandidate && (await getFormSlugs(signal)).includes(ragCandidate)) {
    ragResolution = await resolveActiveForm(ragCandidate, {});
  }
  const ragDecision = decideRagFallback({
    candidate: ragCandidate,
    candidateHandoff: ragResolution.kind === "handoff",
    handedOffSlug: session.handedOffSlug ?? null,
  });
  if (
    ragDecision.action === "fresh-handoff" &&
    ragResolution.kind === "handoff"
  ) {
    resolution = ragResolution;
    // Park it like the matcher-driven handoff does, so the user isn't re-handed
    // the strict link on every later turn.
    session.handedOffSlug = ragCandidate;
  } else if (
    ragDecision.action === "continuation" &&
    ragResolution.kind === "handoff"
  ) {
    // The user was already handed this form's link and is following up ("ok
    // let's begin", "what's next?"). Re-issuing the strict link-only handoff is
    // noisy, but the no-form path makes the model hallucinate inline collection
    // or deny the form exists. Instead keep answering informationally while
    // pointing back to the link. (Already parked — no re-park.)
    handoffContinuation = {
      title: ragResolution.title,
      url: ragResolution.url,
    };
  }

  // Info-intent on a handoff service: buildSystemPrompts offers the link in
  // prose instead of pushing it. We deliberately leave the form PARKED (as the
  // matcher/RAG paths above did, handedOffSlug set) rather than pinning it —
  // pinning would skip the matcher next turn and trap the user on this form if
  // they switch topics. The existing continuation path delivers the link on an
  // affirmative follow-up: the rewrite expands "yes, send it" via history into a
  // retrievable query, which re-surfaces the parked handoff as a continuation.
  const systemPrompts = buildSystemPrompts(
    contextBlock,
    resolution,
    session,
    handoffContinuation,
    offerOnly,
    intent,
  );

  // collect + apply-intent → full field tools. collect + info question
  // (offerOnly) → present_choices ONLY, so the model offers a clickable "Start
  // the application" affordance rather than a dead-end prose "want to start?",
  // but still can't silently record fields on a question. Anything else → none.
  const tools =
    resolution.kind === "collect"
      ? offerOnly
        ? buildOfferTools()
        : buildFormTools(session, resolution.form, signal)
      : [];

  const abortController = childController(signal);

  const env = getServerEnv();
  const stream = chat({
    adapter: bedrockText(model, {
      region: env.BEDROCK_REGION,
      cacheSystemPrompt: env.BEDROCK_PROMPT_CACHE,
    }),
    messages,
    systemPrompts,
    tools,
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
          retrieved: rawSources.map((s) => ({ id: s.id, score: s.score })),
          formSlug: session.slug ?? undefined,
          retrieveDegraded: degraded,
        },
        startedAt,
      ),
    ],
    // DEV: full trace of provider chunks, tool calls, and agent-loop
    // iterations. PROD: `undefined`, which the engine resolves to its
    // errors-only channel — `false` would resolve to ALL_OFF and silence
    // adapter failure logs entirely. Never pass `true` on the deployed
    // Lambda — the full trace logs message content (CloudWatch cost + PII).
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

function buildSystemPrompts(
  contextBlock: string,
  resolution: FormResolution,
  session: FormSession,
  handoffContinuation?: { title: string; url: string },
  offerOnly = false,
  intent: "info" | "apply" = "apply",
): SystemEntry[] {
  const prompts: SystemEntry[] = [
    SYSTEM_PROMPT,
    `Context for this turn:\n${contextBlock}`,
  ];

  if (resolution.kind === "handoff") {
    // apply-intent → hand over the link (the link IS the answer). info-intent
    // (a fact question that happens to map to a handoff service, e.g. "what
    // does a conductor's licence cost and where do I apply?") → answer the
    // question first and OFFER the link in prose, don't push it. The user
    // asked for a fact, not the form.
    prompts.push(
      intent === "info"
        ? buildHandoffOfferDisclosure(resolution.title)
        : buildHandoffDisclosure(resolution.title, resolution.url),
    );
    return prompts;
  }

  if (resolution.kind === "collect") {
    const { slug, schema } = resolution.form;
    // One combined form-state block instead of 3-4 separate system entries.
    // The schema disclosure already names the slug, so no separate marker.
    const parts = [buildSchemaDisclosure(slug, schema)];
    const entries = Object.entries(session.values);
    if (entries.length) {
      const lines = entries
        .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
        .join("\n");
      parts.push(
        `Already collected (do NOT re-ask these unless the user wants to change them):\n${lines}`,
      );
    } else if (offerOnly) {
      // Collect-form matched on an INFO question, nothing collected yet. Answer
      // the question from context, THEN offer a clickable path to start the
      // application via present_choices — NOT a prose "want to start?", which
      // leaves the user no button to act on (and the field tools are withheld
      // this turn, so a prose offer is a dead end). Clicking "Start the
      // application" sends a non-question message next turn, which flips this
      // turn's info-question gate off and lets the real field tools in.
      parts.push(
        'The user asked an INFORMATION question about this service and has NOT said they want to apply yet. First, answer their question from the context above. Then offer to begin by calling present_choices with a short question like "Want to start the application now?" and choices ["Start the application", "I have another question"]. Do NOT ask for any form field and do NOT call set_field this turn — only answer, then offer the choice.',
      );
    } else {
      // Collect-form matched with apply-intent, first turn: begin collecting per
      // the SYSTEM_PROMPT. Answer any side question they bundled in first.
      parts.push(
        "The user wants to apply and has not started yet. Open with a one-line acknowledgement and ask for the FIRST field in the schema (call present_choices if that field is closed-set; otherwise ask it in text). If they also asked a side question, answer it from the context first.",
      );
    }
    if (session.status === "submitted" && session.referenceNumber) {
      parts.push(
        `Submission complete. Reference number: ${session.referenceNumber}. Do NOT submit again.`,
      );
    } else if (session.status === "failed" && session.lastError) {
      parts.push(
        `Last submission attempt failed: ${session.lastError}. Help the user correct the listed fields, then retry submit_form.`,
      );
    }
    prompts.push(parts.join("\n\n"));
  } else if (handoffContinuation) {
    // Follow-up after a handoff: keep helping informationally but keep the link
    // in front of the user — never collect inline, never deny the form exists.
    prompts.push(
      buildHandoffContinuationDisclosure(
        handoffContinuation.title,
        handoffContinuation.url,
      ),
    );
  } else {
    prompts.push(NO_FORM_DISCLOSURE);
  }
  return prompts;
}

// Cheap synchronous deny-list for the obvious script-kiddie attempts.
// Claude already refuses sophisticated jailbreaks; this catches the lazy
// "ignore previous instructions" / "you are now DAN" / system-prompt-dump
// requests without an extra LLM round-trip.
const JAILBREAK_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore (all |previous |your |the )?(prior )?(instructions|rules|guidelines)/i,
  /you are (now )?(DAN|a different AI|jailbroken)/i,
  /(reveal|show|print|repeat).{0,20}(system prompt|your instructions|your rules)/i,
  /pretend (you|that you).{0,20}(have no|don't have).{0,20}(rules|restrictions)/i,
  /disregard (all |previous |your )?(instructions|rules)/i,
];

function looksLikeJailbreak(input: string): boolean {
  if (!input || input.length < 6) return false;
  return JAILBREAK_PATTERNS.some((re) => re.test(input));
}

// Does the message read as an information-seeking question rather than intent to
// apply? Decides whether a matched form answers + offers (info) or enters field
// collection (apply). A plain first-word list (not a pattern catalogue) keeps it
// maintainable; bias is toward "info" — when unsure, answer the question and
// offer the form rather than railroad the user into field prompts.
const QUESTION_OPENERS: ReadonlySet<string> = new Set([
  "what",
  "how",
  "where",
  "when",
  "why",
  "who",
  "which",
  "whose",
  "can",
  "could",
  "do",
  "does",
  "did",
  "is",
  "are",
  "will",
  "would",
  "should",
  "may",
  "whats",
  "hows",
]);

function isInfoQuestion(input: string): boolean {
  const t = input.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  const firstWord = t.split(/[\s'.,]+/)[0];
  return QUESTION_OPENERS.has(firstWord);
}
