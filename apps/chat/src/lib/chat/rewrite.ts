import { chat } from "@tanstack/ai";
import type { UIMessage } from "@tanstack/ai";
import { bedrockText } from "@govtech-bb/ai-bedrock";
import { z } from "zod";
import { childController } from "#/lib/abort";
import { getServerEnv } from "#/config/env";
import { extractText, lastUserText } from "./messages";

const PROMPT = `You rewrite the user's latest message into a single self-contained search query for a retrieval system over Barbados government services. The query is embedded and matched against formal, standard-English service pages, so it MUST use standard-English service vocabulary.

Rules:
- Output ONLY the rewritten query as JSON.
- The user often writes in Bajan / Barbadian Creole. Translate the MEANING into standard English using the words the government service catalogue would use, mapping the everyday need to the likely service. Spelling cues: "de"=the, "muh"=my, "fuh"=for, "wuh"=what, "dey"=they, "cyan"=can't, "ent"/"en"=isn't/don't, "gine"=going to, "pun"=on, "wuk"=work. Examples (these are TEACHING examples, not a lookup table — generalise the pattern):
  - "muh head hurtin and I ent got money fuh de doctor" -> "financial assistance medical help low income"
  - "de pipe burst and flood out de whole house" -> "disaster relief assistance flood damage"
  - "I lookin fuh wuk, nutten ent comin" -> "employment programme finding a job"
  - "wuh I gotta do fuh get muh chile in big school" -> "secondary school placement BSSEE"
- If the message is already a standalone topical question in standard English, return it essentially unchanged.
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
  messages: UIMessage[],
  signal: AbortSignal,
): Promise<string> {
  const latest = lastUserText(messages);
  // Run on the FIRST turn too (not just follow-ups): a first message in Bajan
  // dialect embeds poorly against the formal service pages and retrieves
  // nothing, so it needs normalising before the topic is ever established.
  // Greetings/too-short messages never reach here — run-turn skips retrieval
  // (and thus the rewrite) for those via isGreetingOrTooShort.
  if (!latest) return latest;

  const prompt = PROMPT.replace("{{HISTORY}}", buildHistory(messages)).replace(
    "{{LATEST}}",
    latest,
  );

  const env = getServerEnv();
  // Fall back to raw input if the rewrite call fails — never block a turn.
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
    return out.length > 2 ? out : latest;
  } catch {
    return latest;
  }
}
