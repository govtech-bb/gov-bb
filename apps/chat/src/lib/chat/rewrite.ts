import { chat } from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";
import type { UIMessage } from "@tanstack/ai";
import { z } from "zod";
import { extractText, lastUserText } from "./messages";

const MODEL = "claude-haiku-4-5";

const PROMPT = `You rewrite the user's latest message into a single self-contained search query for a retrieval system over Barbados government services.

Rules:
- Output ONLY the rewritten query as JSON.
- If the latest message is already a standalone topical question, return it unchanged.
- If it's a short follow-up ("how much?", "what documents?", "where do I go?", "is it online?"), expand it using the prior turns so the topic is explicit.
- Drop greetings, filler, and personal data. Keep proper nouns and service names.
- Keep it under 20 words.

Conversation:
{{HISTORY}}

Latest user message: {{LATEST}}`;

const Schema = z.object({
  rewrittenQuery: z.string(),
});

function buildHistory(messages: UIMessage[]): string {
  const trail = messages.slice(-6, -1);
  if (!trail.length) return "(no prior turns)";
  return trail
    .map((m) => `${m.role}: ${extractText(m).slice(0, 300)}`)
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

export async function rewriteRetrievalQuery(
  apiKey: string,
  messages: UIMessage[],
  signal: AbortSignal,
): Promise<string> {
  const latest = lastUserText(messages);
  if (messages.length <= 1 || !latest) return latest;

  const prompt = PROMPT.replace("{{HISTORY}}", buildHistory(messages)).replace(
    "{{LATEST}}",
    latest,
  );

  // Fall back to raw input if the rewrite call fails — never block a turn.
  try {
    const result = await chat({
      adapter: anthropicText(MODEL, { apiKey }),
      messages: [{ role: "user", content: prompt }],
      outputSchema: Schema,
      maxTokens: 100,
      temperature: 0,
      abortController: controllerFor(signal, 3000),
    });
    const out = result.rewrittenQuery.trim();
    return out.length > 2 ? out : latest;
  } catch {
    return latest;
  }
}

function controllerFor(
  parent: AbortSignal,
  timeoutMs: number,
): AbortController {
  const ac = new AbortController();
  const combined = AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)]);
  if (combined.aborted) ac.abort();
  else combined.addEventListener("abort", () => ac.abort(), { once: true });
  return ac;
}
