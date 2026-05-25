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

const SYSTEM_PROMPT =
  "You are a warm, helpful voice assistant for the Government of Barbados service portal. Speak clearly and briefly. If the citizen asks about a service you don't know about, say so and offer to point them to the right place. Use plain English.";

type WireEvent = Record<string, unknown>;

function wrapEvent(payload: WireEvent): { chunk: { bytes: Uint8Array } } {
  return {
    chunk: { bytes: new TextEncoder().encode(JSON.stringify(payload)) },
  };
}

const wss = new WebSocketServer({ port: PORT });
console.log(
  `[voice-ws] listening on ws://localhost:${PORT}  region=${REGION}  model=${MODEL_ID}`,
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

  // Async generator that yields Nova Sonic events to send INTO Bedrock.
  // Pulls from an in-memory queue fed by the browser WebSocket.
  let inputClosed = false;
  const inputQueue: WireEvent[] = [];
  let resolveWaiter: (() => void) | null = null;

  function pushInput(ev: WireEvent) {
    inputQueue.push(ev);
    resolveWaiter?.();
    resolveWaiter = null;
  }

  async function* inputStream() {
    // Session bootstrap
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
        },
      },
    });

    // System prompt
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

    // Open the user audio content block
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

    // Now pump audio events from the queue until the browser disconnects.
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

    // Teardown
    yield wrapEvent({
      event: { contentEnd: { promptName, contentName: audioContentName } },
    });
    yield wrapEvent({ event: { promptEnd: { promptName } } });
    yield wrapEvent({ event: { sessionEnd: {} } });
  }

  // Browser → server: queue audio chunks for the Bedrock stream
  ws.on("message", (raw, isBinary) => {
    if (inputClosed) return;
    if (isBinary) {
      // Browser sent raw PCM16 bytes — wrap as audioInput event.
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
    // JSON control messages from the client (e.g., manual barge-in)
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

  // Open the bidi stream
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

  // Server → browser: relay model output events
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
      relayOutboundEvent(ws, parsed, sessionId);
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

function relayOutboundEvent(
  ws: WebSocket,
  parsed: WireEvent,
  sessionId: string,
) {
  const event = (parsed as { event?: Record<string, WireEvent> }).event;
  if (!event) return;

  if (event.audioOutput) {
    const audio = event.audioOutput as {
      content?: string;
      role?: string;
    };
    if (audio.content) {
      const pcm = Buffer.from(audio.content, "base64");
      if (ws.readyState === ws.OPEN) ws.send(pcm, { binary: true });
    }
    return;
  }

  if (event.textOutput) {
    const t = event.textOutput as {
      content?: string;
      role?: string;
      contentName?: string;
    };
    safeSend(ws, {
      type: "transcript",
      role: t.role ?? "ASSISTANT",
      text: t.content ?? "",
    });
    return;
  }

  if (event.completionEnd) {
    safeSend(ws, { type: "completionEnd" });
    return;
  }

  if (event.contentEnd) {
    const ce = event.contentEnd as {
      type?: string;
      role?: string;
      stopReason?: string;
    };
    if (ce.stopReason === "INTERRUPTED") {
      safeSend(ws, { type: "interrupted" });
    }
    safeSend(ws, {
      type: "contentEnd",
      contentType: ce.type,
      role: ce.role,
      stopReason: ce.stopReason,
    });
    return;
  }

  // Other events (contentStart, completionStart, etc.) — useful for debugging.
  // Keep server quiet by default; uncomment to inspect:
  // console.log(`[voice-ws ${sessionId}]`, Object.keys(event));
  void sessionId;
}

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.error("[voice-ws] send failed", err);
  }
}
