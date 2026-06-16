import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { EMBED_DIMS, embed, embedWithRetry } from "./embed.ts";

const encode = (obj: unknown) => new TextEncoder().encode(JSON.stringify(obj));
const okEmbedding = Array.from(
  { length: EMBED_DIMS },
  (_, i) => i / EMBED_DIMS,
);

test("embed sends the Titan request shape and returns the vector", async () => {
  let captured: Record<string, unknown> | undefined;
  const send = async (cmd: InvokeModelCommand) => {
    // embed() passes the request body as a JSON string.
    captured = JSON.parse(cmd.input.body as string);
    return { body: encode({ embedding: okEmbedding }) };
  };
  const out = await embed("how do I renew my passport?", send);
  assert.equal(out.length, EMBED_DIMS);
  assert.deepEqual(captured, {
    inputText: "how do I renew my passport?",
    dimensions: EMBED_DIMS,
    normalize: true,
  });
});

test("embed throws on a wrong-length embedding", async () => {
  const send = async () => ({ body: encode({ embedding: [0.1, 0.2, 0.3] }) });
  await assert.rejects(() => embed("x", send), /bad response/);
});

test("embedWithRetry retries then succeeds", async () => {
  let calls = 0;
  const send = async () => {
    calls++;
    if (calls < 2) throw new Error("throttled");
    return { body: encode({ embedding: okEmbedding }) };
  };
  const out = await embedWithRetry("x", 3, send);
  assert.equal(out.length, EMBED_DIMS);
  assert.equal(calls, 2);
});

test("embedWithRetry gives up after exhausting retries", async () => {
  let calls = 0;
  const send = async () => {
    calls++;
    throw new Error("always throttled");
  };
  await assert.rejects(() => embedWithRetry("x", 2, send), /always throttled/);
  assert.equal(calls, 3); // initial + 2 retries
});
