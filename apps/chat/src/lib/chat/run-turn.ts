import type { StreamChunk, SystemPrompt, UIMessage } from "@tanstack/ai";
import { chat } from "@tanstack/ai";
import { bedrockText } from "@govtech-bb/ai-bedrock";
import { childController } from "#/lib/abort";
import { getServerEnv } from "#/config/env";
import {
  buildFormTools,
  getOrCreateSession,
  resolveActiveForm,
  matchFormsFromText,
  resetSessionForNewForm,
  withThreadLock,
  type FormResolution,
  type FormSession,
} from "./form";
import { lastUserText, recentUserText } from "./messages";
import {
  NO_FORM_DISCLOSURE,
  SYSTEM_PROMPT,
  buildHandoffDisclosure,
  buildSchemaDisclosure,
} from "./prompts";
import { buildCitedContext, isGreetingOrTooShort, retrieve } from "./retrieval";
import { rewriteRetrievalQuery } from "./rewrite";
import type { Citation, RetrievedContext, Source } from "./types";
import { withTurnLog } from "./turn-log";

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
      citations: Citation[];
    };

export async function runTurn(input: RunTurnInput): Promise<RunTurnResult> {
  // Serialize concurrent runs for the same thread so set_field writes don't
  // interleave and session.status transitions stay coherent.
  return withThreadLock(input.threadId, () => runTurnInner(input));
}

async function runTurnInner(input: RunTurnInput): Promise<RunTurnResult> {
  const { messages, threadId, runId, signal, ragUrl, model } = input;
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

  const resolution: FormResolution = session.slug
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

  // During active field collection the user is answering field prompts, not
  // asking knowledge questions, so skip the rewrite LLM call and RAG retrieval
  // — both are dead weight on every field turn. A side question mid-form loses
  // context for that turn, an acceptable trade for the per-turn token savings.
  const skipRetrieval =
    isGreetingOrTooShort(latest) || resolution.kind === "collect";
  const query = skipRetrieval
    ? latest
    : await rewriteRetrievalQuery(messages, signal);

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

  const systemPrompts = buildSystemPrompts(contextBlock, resolution, session);

  const tools =
    resolution.kind === "collect"
      ? buildFormTools(session, resolution.form, signal)
      : [];

  const abortController = childController(signal);

  const env = getServerEnv();
  const llmStream = chat({
    adapter: bedrockText(model, { region: env.BEDROCK_REGION }),
    messages,
    systemPrompts,
    tools,
    maxTokens: 600,
    temperature: 0,
    abortController,
    // DEV-only: traces provider chunks, tool calls, and agent-loop iterations
    // that withTurnLog (which only taps RUN_FINISHED) can't see. NEVER enable
    // on the deployed Lambda — it logs message content (CloudWatch cost + PII).
    debug: import.meta.env.DEV,
  });

  const stream = withTurnLog(
    llmStream,
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
  );

  return {
    kind: "ok",
    stream,
    abortController,
    activeFormSlug: session.slug ?? undefined,
    citations,
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
): SystemEntry[] {
  const prompts: SystemEntry[] = [
    SYSTEM_PROMPT,
    `Context for this turn:\n${contextBlock}`,
  ];

  if (resolution.kind === "handoff") {
    prompts.push(buildHandoffDisclosure(resolution.title, resolution.url));
    return prompts;
  }

  if (resolution.kind === "collect") {
    const { slug, schema } = resolution.form;
    prompts.push(`Active form: ${slug}`, buildSchemaDisclosure(slug, schema));
    const entries = Object.entries(session.values);
    if (entries.length) {
      const lines = entries
        .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
        .join("\n");
      prompts.push(
        `Already collected (do NOT re-ask these unless the user wants to change them):\n${lines}`,
      );
    }
    if (session.status === "submitted" && session.referenceNumber) {
      prompts.push(
        `Submission complete. Reference number: ${session.referenceNumber}. Do NOT submit again.`,
      );
    } else if (session.status === "failed" && session.lastError) {
      prompts.push(
        `Last submission attempt failed: ${session.lastError}. Help the user correct the listed fields, then retry submit_form.`,
      );
    }
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
