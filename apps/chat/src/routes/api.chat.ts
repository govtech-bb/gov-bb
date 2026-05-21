import { createFileRoute } from "@tanstack/react-router";
import type { StreamChunk, SystemPrompt, UIMessage } from "@tanstack/ai";
import {
  chat,
  chatParamsFromRequest,
  maxIterations,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import {
  anthropicText,
  type AnthropicSystemPromptMetadata,
} from "@tanstack/ai-anthropic";
import { summarizeFormFields } from "#/lib/chat/form-fields";
import { knownFormSlugsInSources } from "#/lib/chat/known-forms";
import { lastUserText } from "#/lib/chat/messages";
import {
  buildContextBlock,
  buildRetrievalQuery,
  filterSources,
  isGreetingOrTooShort,
  onlyLegacySources,
  retrieve,
} from "#/lib/chat/retrieval";
import type { RetrievedContext, Source } from "#/lib/chat/types";
import { openFormReviewDef, presentChoicesDef } from "#/lib/chat-tools";

const RAG_URL = process.env.RAG_URL ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const LLM_MODEL = (process.env.LLM_MODEL ?? "claude-haiku-4-5") as Parameters<
  typeof anthropicText
>[0];

const SYSTEM_PROMPT = `You help people find Barbados government services on alpha.gov.bb.

VOICE:
- Talk like a helpful person, not a brochure. Conversational, warm, direct.
- No "I'm here to help you with..." intros. No listing of capabilities. Skip filler.
- If the user just says hi, reply with one short friendly line and ask what they need. Nothing else.
- Use contractions ("you'll", "it's"). Sound human.

FORMATTING — REAL MARKDOWN:
Your output is rendered as Markdown. You MUST emit Markdown markers literally.

- Bold a section label by wrapping it in double asterisks: \`**Steps**\`. NEVER write a label as plain text on its own line — the UI won't bold it.
- Bullets MUST start with "- " (hyphen + space) at the START of the line. NEVER indent bullets with spaces or tabs. NEVER use just a paragraph break to imply a list.
- Numbered lists use "1. ", "2. ", "3. " at the START of the line. Only use when order matters.
- Put a blank line BEFORE and AFTER every heading and every list. Without blank lines the markdown renders wrong.
- One short line per bullet (under ~18 words). No prose paragraphs inside bullets.
- Use \`**bold**\` for emphasis on a few key words; do not bold whole paragraphs.

EXACT EXAMPLE of a good answer (this is the literal shape — every \`-\`, \`**\`, and blank line matters):

You can pre-register the birth online, then visit the Registration Department in person to sign the register.

**Steps**

1. Pre-register online with the baby's and parents' details (about 10 minutes).
2. Visit the registry office in the district where the child was born to sign the register.
3. Collect the certificate in 2 to 3 days.

**Cost**

- BDS $5.00 per certified copy.

**Who registers**

- If married: the father registers, the mother can attend.
- If not married: the mother registers. The father can attend if he wants to be named on the record.

Want me to start the pre-registration form for you?

ANSWER LENGTH:
- Trivial reply (greeting, one-line redirect): 1 sentence, no headings, no lists.
- Standard informational answer: 1-sentence intro + 2 to 4 labelled sections + 1-line follow-up question.
- No raw URLs in the body. Sources render separately.

PUNCTUATION — STRICT:
- Do NOT use em dashes (—) or en dashes (–). Anywhere. Ever.
- Use a period, comma, colon, or parentheses instead. Split into two sentences if needed.
- Hyphens in compound words ("self-employed") are fine. Range/joiner dashes are not.

CONTEXT USE — STRICT RAG:
- Every factual claim (fee, eligibility rule, document, contact detail, name, opening hour) MUST come from the retrieved context for THIS turn. If the context doesn't contain it, do NOT state it — say "I don't have that detail" and offer the next-best step.
- Do NOT invent, paraphrase loosely, or "round" numbers. "$5 BBD" stays "$5 BBD", not "around $5".
- If a fact is in the context (even if it surprises you), state it confidently. Don't pre-emptively hedge.
- Use the prior conversation to interpret follow-ups ("what documents", "how much", "where do I go" → same service as the previous turn). Don't ask the user which service they mean if it's obvious from history.
- Off-topic? Politely redirect in one line.

WHEN THE USER PUSHES BACK ("are you sure?", "really?", "that doesn't sound right"):
- Do NOT apologise and retract.
- Re-read the context. If the fact IS there, restate it and point to the source: "Yes — the official page says: '<exact quote>'." Then offer to share the link.
- If the fact is NOT in this turn's context (only in your prior message from history), say so plainly and suggest verifying with the registry office. Do not double down on a claim you cannot ground.
- Apologising and retracting a TRUE statement just because the user questioned it is worse than being wrong. Stay grounded in what the context says.

INTERACTIVE CHOICES:
- When you ask the user a question whose answer is a SHORT CLOSED SET (yes/no, certificate type, role like parent vs guardian, regular vs urgent processing), call the \`present_choices\` tool. The UI renders the question and buttons from the tool's \`question\` and \`choices\` fields.
- DO NOT also type the question as text in the same turn — that double-renders. Make the tool call your ONLY output for that turn.
- The tool returns \`{shown: true}\` immediately; your turn then ends. The user's pick arrives as a normal user message in the next turn. Continue the conversation from that user message as if they had typed the choice.
- Do NOT use \`present_choices\` for open-ended answers (names, dates, addresses, free text).
- Do NOT call \`present_choices\` more than once per assistant turn.

DEFAULT MODE — INFORMATIONAL (RAG):
- Most questions are informational: "how do I get a passport?", "what's the fee?", "where do I go?". Answer these from the retrieved context. Do NOT start a form flow. Do NOT call \`present_choices\` for informational questions.`;

const LEGACY_DISCLOSURE = `NOTE: The context for this turn comes from the current gov.bb site — this service hasn't moved to alpha.gov.bb yet. Answer the question normally from the context, then add ONE short closing line like "This one's still on the current gov.bb site — alpha version coming soon." Do NOT offer to start an application; the alpha form isn't available yet.`;

const NO_FORM_DISCLOSURE = `HARD OVERRIDE — NO ONLINE FORM AVAILABLE:
- There is NO online form for the service this turn is about. Even if the retrieved context says "pre-register online", "Start now", or links to a /form URL, those mentions are aspirational; the form has not been built yet.
- DO NOT use phrases like "pre-register online", "fill in the form online", "start the form", "I can start the application for you", or anything that implies an online submission is possible.
- DO answer the substance of the question from the context (what documents, who registers, where to go), but frame the entire process as in-person / phone / by-mail according to what the context says.
- DO NOT end the message with "Want me to start the application/form for you?". Instead end with an informational follow-up (e.g. "Want the address of the registry office?", "Want the late-registration fees?").
- Under NO circumstances call open_form_review this turn. The tool is not even available.`;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildSchemaDisclosure(slug: string, schema: string): string {
  return `FORM SCHEMA for "${slug}". Collect every required field before calling open_form_review.\n\n${schema}`;
}

async function* withSourcesPrefix(
  inner: AsyncIterable<StreamChunk>,
  sources: Source[],
): AsyncGenerator<StreamChunk> {
  const sourcesEvent = {
    type: "CUSTOM",
    name: "sources",
    value: sources,
  } as StreamChunk;
  yield sourcesEvent;
  for await (const chunk of inner) yield chunk;
}

type SystemEntry = SystemPrompt<AnthropicSystemPromptMetadata>;

// Cache marker for static (per-deploy) system prompts so Anthropic skips
// re-tokenising them every turn. The per-turn context block stays uncached.
const CACHE_EPHEMERAL: AnthropicSystemPromptMetadata = {
  cache_control: { type: "ephemeral" },
};

async function handlePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  if (!(RAG_URL && ANTHROPIC_API_KEY)) {
    return jsonError("RAG_URL or ANTHROPIC_API_KEY missing", 500);
  }

  let messages: UIMessage[];
  try {
    const params = await chatParamsFromRequest(request);
    messages = params.messages as unknown as UIMessage[];
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "Invalid chat request body";
    return jsonError(reason, 400);
  }

  const query = buildRetrievalQuery(messages);
  const skipRetrieval = isGreetingOrTooShort(lastUserText(messages));

  let contexts: RetrievedContext[] = [];
  let rawSources: Source[] = [];

  if (!skipRetrieval) {
    const result = await retrieve(RAG_URL, query, request.signal);
    if (!result.ok) {
      console.warn(`[chat] retrieve degraded: ${result.reason}`);
    } else {
      contexts = result.data.contexts;
      rawSources = result.data.sources;
    }
  }

  const sources = filterSources(rawSources, query);
  const contextBlock = buildContextBlock(contexts);

  const formSlugs = knownFormSlugsInSources(sources.map((s) => s.url));
  const tools = formSlugs.length
    ? [presentChoicesDef, openFormReviewDef]
    : [presentChoicesDef];

  const systemPrompts: SystemEntry[] = [
    // Static, big — caches well.
    { content: SYSTEM_PROMPT, metadata: CACHE_EPHEMERAL },
    // Volatile, per-turn.
    `Context for this turn:\n${contextBlock}`,
  ];
  if (formSlugs.length) {
    systemPrompts.push(
      `Online forms available for this turn (these are the ONLY valid slugs for open_form_review): ${formSlugs.join(", ")}`,
    );
    const summaries = await Promise.all(
      formSlugs.map(async (slug) => ({
        slug,
        schema: await summarizeFormFields(slug),
      })),
    );
    for (const { slug, schema } of summaries) {
      if (schema) systemPrompts.push(buildSchemaDisclosure(slug, schema));
    }
  } else {
    // Static disclosure — caches well alongside SYSTEM_PROMPT when no forms.
    systemPrompts.push({
      content: NO_FORM_DISCLOSURE,
      metadata: CACHE_EPHEMERAL,
    });
  }
  if (onlyLegacySources(sources)) {
    systemPrompts.push(LEGACY_DISCLOSURE);
  }

  // Single AbortController drives both the LLM stream and the SSE response,
  // tracking client disconnects via request.signal.
  const abortController = new AbortController();
  if (request.signal.aborted) {
    abortController.abort();
  } else {
    request.signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });
  }

  const llmStream = chat({
    adapter: anthropicText(LLM_MODEL, { apiKey: ANTHROPIC_API_KEY }),
    messages,
    systemPrompts,
    tools,
    maxTokens: 600,
    // Low temperature for grounded RAG — counters capitulation under
    // user pushback. See SYSTEM_PROMPT 'WHEN THE USER PUSHES BACK' rules.
    temperature: 0.3,
    // Both tools terminate the turn (client-side, single call). No agent loop.
    agentLoopStrategy: maxIterations(1),
    abortController,
  });

  return toServerSentEventsResponse(withSourcesPrefix(llmStream, sources), {
    abortController,
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handlePost({ request }),
    },
  },
});
