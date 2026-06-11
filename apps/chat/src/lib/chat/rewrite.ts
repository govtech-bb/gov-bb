import { chat } from "@tanstack/ai";
import type { UIMessage } from "@tanstack/ai";
import { bedrockText } from "@govtech-bb/ai-bedrock";
import { z } from "zod";
import { childController } from "#/lib/abort";
import { getServerEnv } from "#/config/env";
import { extractText, lastUserText } from "./messages";

const PROMPT = `You do two jobs for a Barbados government-services chatbot: (1) rewrite the user's latest message into a search query, and (2) classify their intent.

JOB 1 — REWRITE. Produce a single self-contained search query. It is embedded and matched against formal, standard-English service pages, so it MUST use standard-English service vocabulary.
- Users may sometimes write in pure Bajan dialect. Do your best to understand the intent — focus on keywords — and translate the meaning into the standard-English vocabulary the government service catalogue would use, mapping the everyday need to the likely service.
- If the message is already a standalone topical question in standard English, return it essentially unchanged.
- If it's a short follow-up ("how much?", "what documents?", "where do I go?", "is it online?", "yes please"), expand it using the prior turns so the topic is explicit.
- Drop greetings, filler, and personal data. Keep proper nouns and service names. Under 20 words.

JOB 2 — INTENT. Classify this turn as "apply" or "info":
- "apply" — the user wants to obtain, apply for, register for, or START a service, OR describes a personal situation/need a service addresses ("I need a death certificate", "my baby was born last week", "I want to sit CAPE", "how do I apply for terms leave", "yes, send the link"). An expressed desire or need is "apply" EVEN IF the sentence also asks a question.
- "info" — the user is ONLY asking for facts or an explanation and has not signalled they want to start now ("what does X cost?", "who is eligible?", "how long does it take?", "what does the Welfare Department do?", and compound fact questions like "how much is X and where do I apply?").
- When genuinely unsure, choose "apply".

Conversation:
{{HISTORY}}

Latest user message: {{LATEST}}`;

const Schema = z.object({
  rewrittenQuery: z.string(),
  intent: z.enum(["info", "apply"]),
});

export interface RewriteResult {
  query: string;
  // "apply" => the user wants the service (offer the form/link). "info" => a
  // fact question (answer it; don't push a form). Drives the handoff link gate
  // in run-turn. Defaults to "apply" (the safe, link-preserving default) when
  // the rewrite is skipped or fails.
  intent: "info" | "apply";
}

function buildHistory(messages: UIMessage[]): string {
  const trail = messages.slice(-6, -1);
  if (!trail.length) return "(no prior turns)";
  return trail
    .map((m) => `${m.role}: ${extractText(m).slice(0, 300)}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

export async function rewriteRetrievalQuery(
  messages: UIMessage[],
  signal: AbortSignal,
): Promise<RewriteResult> {
  const latest = lastUserText(messages);
  // Run on the FIRST turn too (not just follow-ups): a first message in Bajan
  // dialect embeds poorly against the formal service pages and retrieves
  // nothing, so it needs normalising before the topic is ever established.
  // Greetings/too-short messages never reach here — run-turn skips retrieval
  // (and thus the rewrite) for those via isGreetingOrTooShort.
  if (!latest) return { query: latest, intent: "apply" };

  const prompt = PROMPT.replace("{{HISTORY}}", buildHistory(messages)).replace(
    "{{LATEST}}",
    latest,
  );

  const env = getServerEnv();
  // Fall back to raw input + the link-preserving "apply" intent if the rewrite
  // call fails — never block a turn, and never silently suppress a form link.
  try {
    const result = await chat({
      adapter: bedrockText(env.REWRITE_MODEL, {
        region: env.BEDROCK_REGION,
      }),
      messages: [{ role: "user", content: prompt }],
      outputSchema: Schema,
      modelOptions: { maxTokens: 100, temperature: 0 },
      abortController: childController(signal, 3000),
    });
    const out = result.rewrittenQuery.trim();
    return {
      query: out.length > 2 ? out : latest,
      intent: result.intent,
    };
  } catch {
    return { query: latest, intent: "apply" };
  }
}
