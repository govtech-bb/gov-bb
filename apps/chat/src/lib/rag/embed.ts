// Bedrock Titan Text Embeddings v2 (1024d). Requires AWS creds in env or
// ~/.aws (SDK default chain). Region from BEDROCK_REGION or AWS_REGION.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const MODEL_ID =
  process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-text-v2:0";
export const EMBED_DIMS = 1024;

console.log(`[rag/embed] model=${MODEL_ID} dims=${EMBED_DIMS}`);

let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!client) {
    const region =
      process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1";
    client = new BedrockRuntimeClient({ region });
  }
  return client;
}

interface TitanEmbedResponse {
  embedding: number[];
}

export async function embed(text: string): Promise<number[]> {
  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      inputText: text,
      dimensions: EMBED_DIMS,
      normalize: true,
    }),
  });
  const res = await getClient().send(cmd);
  const parsed = JSON.parse(
    new TextDecoder().decode(res.body),
  ) as TitanEmbedResponse;
  if (
    !Array.isArray(parsed.embedding) ||
    parsed.embedding.length !== EMBED_DIMS
  ) {
    throw new Error(
      `Bedrock embed: bad response (len=${parsed.embedding?.length})`,
    );
  }
  return parsed.embedding;
}

// Titan embed API is single-input. Sequential is fine for our chunk volume;
// add concurrency cap if throughput matters.
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}
