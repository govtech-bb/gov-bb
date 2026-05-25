// POC: WebSocket relay between the browser and Amazon Nova Sonic on Bedrock.
// Run alongside `pnpm dev` with `pnpm voice:ws`. Not for production.

import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.VOICE_WS_PORT ?? 3001);
const REGION = process.env.VOICE_BEDROCK_REGION ?? "us-east-1";
const MODEL_ID = process.env.VOICE_MODEL_ID ?? "amazon.nova-2-sonic-v1:0";
const VOICE_ID = process.env.VOICE_VOICE_ID ?? "matthew";

// Same contract as the text chat: POST {RAG_URL}/retrieve with { query, topK }.
// If RAG_URL is unset, fall back to the local Nitro route at the dev server.
const RAG_URL = process.env.RAG_URL ?? "";
const RAG_RETRIEVE_URL = RAG_URL
  ? `${RAG_URL.replace(/\/$/, "")}/retrieve`
  : "http://localhost:3000/api/retrieve";

const SYSTEM_PROMPT =
  "You are a warm, helpful voice assistant for the Government of Barbados service portal. " +
  "Speak clearly and briefly. Use plain English. " +
  "When the citizen asks about ANY specific government service, fee, document, eligibility rule, contact, or process, " +
  "call the lookup_services tool first to get accurate context, then answer from what it returns. " +
  "Never invent fees, hours, or contacts. If lookup_services returns nothing useful, say you don't have that detail and offer the next-best step.";

const TOOL_NAME = "lookup_services";
const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Natural-language search query about a Government of Barbados service. Use the citizen's own words.",
    },
  },
  required: ["query"],
};

type WireEvent = Record<string, unknown>;

function wrapEvent(payload: WireEvent): { chunk: { bytes: Uint8Array } } {
  return {
    chunk: { bytes: new TextEncoder().encode(JSON.stringify(payload)) },
  };
}

const wss = new WebSocketServer({ port: PORT });
console.log(
  `[voice-ws] listening on ws://localhost:${PORT}  region=${REGION}  model=${MODEL_ID}  rag=${RAG_RETRIEVE_URL}`,
);

wss.on("connection", (ws) => {
  const sessionId = randomUUID().slice(0, 8);
  console.log(`[voice-ws ${sessionId}] connected`);
  handleSession(ws, sessionId).catch((err) => {
    console.error(`[voice-ws ${sessionId}] fatal`, err);
    safeSend(ws, { type: "error", message: String(err?.message ?? err) });
    ws.close();
  });
});

async function handleSession(ws: WebSocket, sessionId: string) {
  const client = new BedrockRuntimeClient({
    region: REGION,
    requestHandler: new NodeHttp2Handler({
      requestTimeout: 9 * 60_000,
      sessionTimeout: 9 * 60_000,
      disableConcurrentStreams: false,
    }),
  });

  const promptName = randomUUID();
  const audioContentName = randomUUID();
  const sysContentName = randomUUID();

  let inputClosed = false;
  const inputQueue: WireEvent[] = [];
  let resolveWaiter: (() => void) | null = null;

  function pushInput(ev: WireEvent) {
    inputQueue.push(ev);
    resolveWaiter?.();
    resolveWaiter = null;
  }

  async function* inputStream() {
    yield wrapEvent({
      event: {
        sessionStart: {
          inferenceConfiguration: {
            maxTokens: 1024,
            topP: 0.9,
            temperature: 0.7,
          },
          turnDetectionConfiguration: {
            endpointingSensitivity: "HIGH",
          },
        },
      },
    });

    yield wrapEvent({
      event: {
        promptStart: {
          promptName,
          textOutputConfiguration: { mediaType: "text/plain" },
          audioOutputConfiguration: {
            mediaType: "audio/lpcm",
            sampleRateHertz: 24000,
            sampleSizeBits: 16,
            channelCount: 1,
            voiceId: VOICE_ID,
            encoding: "base64",
            audioType: "SPEECH",
          },
          toolUseOutputConfiguration: { mediaType: "application/json" },
          toolConfiguration: {
            tools: [
              {
                toolSpec: {
                  name: TOOL_NAME,
                  description:
                    "Search the Barbados Government services knowledge base for accurate information about a citizen's question. Returns relevant service descriptions, fees, eligibility, contacts, and process steps with citation URLs.",
                  inputSchema: { json: JSON.stringify(TOOL_INPUT_SCHEMA) },
                },
              },
            ],
          },
        },
      },
    });

    yield wrapEvent({
      event: {
        contentStart: {
          promptName,
          contentName: sysContentName,
          type: "TEXT",
          interactive: true,
          role: "SYSTEM",
          textInputConfiguration: { mediaType: "text/plain" },
        },
      },
    });
    yield wrapEvent({
      event: {
        textInput: {
          promptName,
          contentName: sysContentName,
          content: SYSTEM_PROMPT,
        },
      },
    });
    yield wrapEvent({
      event: { contentEnd: { promptName, contentName: sysContentName } },
    });

    yield wrapEvent({
      event: {
        contentStart: {
          promptName,
          contentName: audioContentName,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: {
            mediaType: "audio/lpcm",
            sampleRateHertz: 16000,
            sampleSizeBits: 16,
            channelCount: 1,
            audioType: "SPEECH",
            encoding: "base64",
          },
        },
      },
    });

    while (!inputClosed || inputQueue.length > 0) {
      if (inputQueue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveWaiter = resolve;
        });
        continue;
      }
      const next = inputQueue.shift();
      if (next) yield wrapEvent(next);
    }

    yield wrapEvent({
      event: { contentEnd: { promptName, contentName: audioContentName } },
    });
    yield wrapEvent({ event: { promptEnd: { promptName } } });
    yield wrapEvent({ event: { sessionEnd: {} } });
  }

  ws.on("message", (raw, isBinary) => {
    if (inputClosed) return;
    if (isBinary) {
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      pushInput({
        event: {
          audioInput: {
            promptName,
            contentName: audioContentName,
            content: buf.toString("base64"),
          },
        },
      });
      return;
    }
    try {
      const msg = JSON.parse(raw.toString());
      if (msg?.type === "stop") closeInput();
    } catch {
      // ignore
    }
  });

  const closeInput = () => {
    if (inputClosed) return;
    inputClosed = true;
    resolveWaiter?.();
    resolveWaiter = null;
  };

  ws.on("close", () => {
    console.log(`[voice-ws ${sessionId}] browser disconnected`);
    closeInput();
  });
  ws.on("error", (err) => {
    console.error(`[voice-ws ${sessionId}] ws error`, err);
    closeInput();
  });

  const command = new InvokeModelWithBidirectionalStreamCommand({
    modelId: MODEL_ID,
    body: inputStream(),
  });

  let response;
  try {
    response = await client.send(command);
  } catch (err) {
    console.error(`[voice-ws ${sessionId}] bedrock open failed`, err);
    safeSend(ws, {
      type: "error",
      message: `Bedrock connect failed: ${(err as Error).message}`,
    });
    ws.close();
    return;
  }

  if (!response.body) {
    safeSend(ws, { type: "error", message: "No response body from Bedrock" });
    ws.close();
    return;
  }

  safeSend(ws, { type: "ready" });

  // Tool-call buffer: Nova Sonic emits contentStart(TOOL) → toolUse → contentEnd(TOOL).
  // We capture toolUseId+name+input, then on contentEnd(TOOL) we fetch RAG and
  // push a toolResult content block back into the input queue.
  let pendingToolUse: {
    toolUseId: string;
    name: string;
    input: string;
  } | null = null;

  async function resolveToolCall(call: {
    toolUseId: string;
    name: string;
    input: string;
  }) {
    let parsedInput: { query?: string } = {};
    try {
      parsedInput = JSON.parse(call.input);
    } catch {
      // ignore malformed input
    }
    const query = (parsedInput.query ?? "").trim();
    console.log(
      `[voice-ws ${sessionId}] tool ${call.name} query=${JSON.stringify(query)}`,
    );

    let result: unknown;
    if (!query) {
      result = { error: "empty query" };
    } else {
      try {
        result = await callRag(query);
      } catch (err) {
        console.error(`[voice-ws ${sessionId}] rag failed`, err);
        result = { error: (err as Error).message };
      }
    }

    const toolContentName = randomUUID();
    pushInput({
      event: {
        contentStart: {
          promptName,
          contentName: toolContentName,
          interactive: false,
          type: "TOOL",
          role: "TOOL",
          toolResultInputConfiguration: {
            toolUseId: call.toolUseId,
            type: "TEXT",
            textInputConfiguration: { mediaType: "text/plain" },
          },
        },
      },
    });
    pushInput({
      event: {
        toolResult: {
          promptName,
          contentName: toolContentName,
          content: JSON.stringify(result),
        },
      },
    });
    pushInput({
      event: { contentEnd: { promptName, contentName: toolContentName } },
    });
  }

  try {
    for await (const chunk of response.body) {
      const bytes = chunk?.chunk?.bytes;
      if (!bytes) continue;
      let parsed: WireEvent;
      try {
        parsed = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        continue;
      }
      const event = (parsed as { event?: Record<string, WireEvent> }).event;
      if (!event) continue;

      if (event.toolUse) {
        const tu = event.toolUse as {
          toolUseId?: string;
          toolName?: string;
          content?: string;
        };
        if (tu.toolUseId && tu.toolName) {
          pendingToolUse = {
            toolUseId: tu.toolUseId,
            name: tu.toolName,
            input: tu.content ?? "{}",
          };
        }
        continue;
      }

      if (event.contentEnd) {
        const ce = event.contentEnd as {
          type?: string;
          role?: string;
          stopReason?: string;
        };
        if (ce.type === "TOOL" && pendingToolUse) {
          const captured = pendingToolUse;
          pendingToolUse = null;
          void resolveToolCall(captured);
          continue;
        }
        if (ce.stopReason === "INTERRUPTED") {
          safeSend(ws, { type: "interrupted" });
        }
        safeSend(ws, {
          type: "contentEnd",
          contentType: ce.type,
          role: ce.role,
          stopReason: ce.stopReason,
        });
        continue;
      }

      if (event.audioOutput) {
        const audio = event.audioOutput as { content?: string };
        if (audio.content) {
          const pcm = Buffer.from(audio.content, "base64");
          if (ws.readyState === ws.OPEN) ws.send(pcm, { binary: true });
        }
        continue;
      }

      if (event.textOutput) {
        const t = event.textOutput as { content?: string; role?: string };
        safeSend(ws, {
          type: "transcript",
          role: t.role ?? "ASSISTANT",
          text: t.content ?? "",
        });
        continue;
      }

      if (event.completionEnd) {
        safeSend(ws, { type: "completionEnd" });
        continue;
      }
    }
  } catch (err) {
    console.error(`[voice-ws ${sessionId}] stream error`, err);
    safeSend(ws, {
      type: "error",
      message: `Stream error: ${(err as Error).message}`,
    });
  } finally {
    console.log(`[voice-ws ${sessionId}] stream closed`);
    closeInput();
    try {
      ws.close();
    } catch {}
  }
}

async function callRag(query: string): Promise<unknown> {
  const res = await fetch(RAG_RETRIEVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, topK: 6 }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`retrieve ${res.status}`);
  }
  const data = (await res.json()) as {
    contexts?: Array<{
      title?: string;
      section?: string;
      text?: string;
    }>;
    sources?: Array<{ url?: string; score?: number }>;
  };
  // Build a compact text block for Sonic — short titles + url + 400 chars of text.
  const contexts = data.contexts ?? [];
  const sources = data.sources ?? [];
  const blocks: string[] = [];
  for (let i = 0; i < contexts.length && i < 4; i++) {
    const c = contexts[i];
    const s = sources[i];
    const head = c.section ? `${c.title} — ${c.section}` : c.title;
    const body = (c.text ?? "").slice(0, 400);
    const url = s?.url ?? "";
    blocks.push(`[${i + 1}] ${head}\n${url}\n${body}`);
  }
  return {
    summary: blocks.length
      ? `${blocks.length} relevant source${blocks.length > 1 ? "s" : ""} found.`
      : "No relevant sources found.",
    sources: blocks.join("\n\n"),
  };
}

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.error("[voice-ws] send failed", err);
  }
}
