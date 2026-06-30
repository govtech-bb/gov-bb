import { chat } from "@tanstack/ai";
import { bedrockText, type BedrockConverseModels } from "@tanstack/ai-bedrock";
import { resolveBedrockModelId } from "@govtech-bb/ai-bedrock";
import { z } from "zod";
import { getServerEnv } from "#/config/env";
import { childController } from "./abort";
import { lastUserText, recentHistory, type ChatMessage } from "./messages";

// Fold the conversation into ONE standalone search query. The question-answering
// path only needs the query — there's no apply/info intent classification here.
// The query is embedded against formal, standard-English service pages, so
// dialect is normalised to service vocabulary.
const PROMPT = `Rewrite the user's latest message into a single self-contained search query for the Government of Barbados service catalogue. It is embedded against formal, standard-English service pages, so use standard-English service vocabulary.
- Users may write in Bajan dialect — infer the intent from keywords and translate it to the standard-English service the catalogue would use.
- If the message is already a standalone topical question in standard English, return it essentially unchanged.
- If it's a short follow-up ("how much?", "what documents?", "is it online?"), expand it using the prior turns so the topic is explicit.
- Drop greetings, filler, and personal data. Keep proper nouns and service names. Under 20 words.

Conversation:
{{HISTORY}}

Latest user message: {{LATEST}}`;

const Schema = z.object({ query: z.string() });

// Standalone-question rewrite via the cheaper REWRITE_MODEL. Never blocks a
// turn: a failure / timeout falls back to the raw latest message. Greetings and
// too-short messages never reach here (the caller skips retrieval for those).
export async function rewriteRetrievalQuery(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const latest = lastUserText(messages);
  if (!latest) return latest;

  const prompt = PROMPT.replace("{{HISTORY}}", recentHistory(messages)).replace(
    "{{LATEST}}",
    latest,
  );

  const env = getServerEnv();
  // Abort on the parent signal (client disconnect) OR a 3s timeout — never block
  // the turn on the rewrite. AbortSignal.timeout self-clears, so no bookkeeping.
  try {
    const result = await chat({
      adapter: bedrockText(
        resolveBedrockModelId(env.REWRITE_MODEL) as BedrockConverseModels,
        { region: env.BEDROCK_REGION },
      ),
      messages: [{ role: "user", content: prompt }],
      outputSchema: Schema,
      modelOptions: { max_completion_tokens: 100, temperature: 0 },
      abortController: childController(signal, 3000),
    });
    const out = result.query?.trim() ?? "";
    return out.length > 2 ? out : latest;
  } catch {
    return latest;
  }
}
