import { Button } from "@govtech-bb/react";
import { useCallback, useEffect, useRef, useState } from "react";

type VoiceState = "idle" | "connecting" | "live" | "error";

type ServerEvent =
  | { type: "ready" }
  | { type: "transcript"; role: string; text: string }
  | { type: "interrupted" }
  | { type: "contentEnd"; contentType?: string; role?: string; stopReason?: string }
  | { type: "completionEnd" }
  | { type: "error"; message: string };

const WS_URL =
  (typeof window !== "undefined" &&
    (window as { __VOICE_WS_URL__?: string }).__VOICE_WS_URL__) ||
  "ws://localhost:3001";

export function VoiceButton({
  onTranscript,
}: {
  onTranscript?: (role: string, text: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const playheadRef = useRef<number>(0);

  const stop = useCallback(() => {
    try {
      wsRef.current?.send(JSON.stringify({ type: "stop" }));
    } catch {}
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    playheadRef.current = 0;
    setState("idle");
  }, []);

  // Citizen-facing error string mapping.
  const friendlyError = (raw: string, kind: "mic" | "ws" | "session"): string => {
    if (kind === "mic") {
      if (/denied|notallowed|not allowed/i.test(raw)) {
        return "Microphone access is blocked. Check your browser settings to allow the microphone, then try again.";
      }
      if (/notfound|no device/i.test(raw)) {
        return "No microphone found. Connect a mic and try again.";
      }
      return "Could not access the microphone. Check your browser settings, then try again.";
    }
    if (kind === "ws") {
      return "Voice is not available right now. You can still type your question.";
    }
    return "Voice call ended. You can type your question below.";
  };

  const start = useCallback(async () => {
    setError(null);
    setState("connecting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      setError(friendlyError((err as Error).message, "mic"));
      setState("error");
      return;
    }
    streamRef.current = stream;

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule("/voice-worklet.js");
    } catch (err) {
      setError(`Audio setup failed: ${(err as Error).message}`);
      setState("error");
      stop();
      return;
    }

    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        let msg: ServerEvent | null = null;
        try {
          msg = JSON.parse(ev.data) as ServerEvent;
        } catch {
          return;
        }
        if (!msg) return;
        if (msg.type === "ready") {
          setState("live");
          wireMicToSocket(ctx, stream, ws);
        } else if (msg.type === "transcript") {
          onTranscript?.(msg.role, msg.text);
        } else if (msg.type === "interrupted") {
          // Barge-in: drop queued playback and resume from "now".
          // Suspend/resume flushes pending AudioBufferSourceNodes in Chromium/Firefox;
          // resetting the playhead so the next chunk starts immediately.
          const c = ctxRef.current;
          if (c) {
            void c.suspend().then(() => c.resume());
            playheadRef.current = c.currentTime;
          }
        } else if (msg.type === "error") {
          setError(msg.message);
          setState("error");
          stop();
        }
        return;
      }
      // Binary: PCM16 @ 24 kHz from Nova Sonic
      playPcm(ctx, playheadRef, ev.data as ArrayBuffer);
    };

    ws.onerror = () => {
      setError(friendlyError("", "ws"));
      setState("error");
    };

    ws.onclose = () => {
      // Always normalise to idle when the socket closes (whether we initiated or not).
      // Surface a citizen-friendly notice if the close was unexpected.
      const live = stateRef.current === "live";
      if (live) setError(friendlyError("", "session"));
      setState((s) => (s === "error" ? s : "idle"));
    };
  }, [onTranscript, stop]);

  // Mirror state into a ref so async ws handlers see the current value.
  const stateRef = useRef<VoiceState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const wireMicToSocket = (
    ctx: AudioContext,
    stream: MediaStream,
    ws: WebSocket,
  ) => {
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    nodeRef.current = node;
    node.port.onmessage = (e) => {
      if (ws.readyState === ws.OPEN) ws.send(e.data as ArrayBuffer);
    };
    source.connect(node);
    // Do not connect to destination — we don't want mic echoed to speakers.
  };

  useEffect(() => () => stop(), [stop]);

  const label =
    state === "idle"
      ? "Talk"
      : state === "connecting"
      ? "Connecting…"
      : state === "live"
      ? "Stop"
      : "Try again";

  const ariaLabel =
    state === "live" ? "Stop voice conversation" : "Start a voice conversation";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={state === "live" ? stop : start}
        type="button"
        disabled={state === "connecting"}
        aria-label={ariaLabel}
      >
        {state === "live" ? "● " : null}
        {label}
      </Button>
      {error ? (
        <span className="text-disclaimer text-red-600 max-w-xs text-right">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function playPcm(
  ctx: AudioContext,
  playheadRef: React.MutableRefObject<number>,
  data: ArrayBuffer,
) {
  const pcm = new Int16Array(data);
  const buf = ctx.createBuffer(1, pcm.length, 24000);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.onended = () => src.disconnect();

  const now = ctx.currentTime;
  const startAt = Math.max(playheadRef.current, now);
  src.start(startAt);
  playheadRef.current = startAt + buf.duration;
}
