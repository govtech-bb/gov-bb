// Bedrock Titan Text Embeddings v2 (1024d). Requires AWS creds in env or
// ~/.aws (SDK default chain). Region from BEDROCK_REGION or AWS_REGION.
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export const MODEL_ID =
  process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-text-v2:0";
export const EMBED_DIMS = 1024;

// The send call is injectable so embed() is unit-testable without a live
// Bedrock call (tests pass a fake). Defaults to the lazy real client.
type SendFn = (cmd: InvokeModelCommand) => Promise<{ body?: Uint8Array }>;

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) {
    const region =
      process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "ca-central-1";
    client = new BedrockRuntimeClient({ region });
  }
  return client;
}
const defaultSend: SendFn = (cmd) => getClient().send(cmd);

interface TitanEmbedResponse {
  embedding: number[];
}

export async function embed(
  text: string,
  send: SendFn = defaultSend,
): Promise<number[]> {
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
  const res = await send(cmd);
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

// Bedrock Titan throttles per-model; a transient throttle/5xx shouldn't abort a
// long ingest run. Retry a few times with exponential backoff. Used by the
// ingest writer, not the latency-sensitive request path.
export async function embedWithRetry(
  text: string,
  retries = 3,
  send: SendFn = defaultSend,
): Promise<number[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await embed(text, send);
    } catch (err) {
      if (attempt >= retries) throw err;
      console.warn(
        `[rag/embed] retry ${attempt + 1}/${retries}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}
