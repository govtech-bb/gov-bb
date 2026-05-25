# Voice POC — Amazon Nova Sonic 2

Realtime back-and-forth voice between the browser and `amazon.nova-2-sonic-v1:0`
via a local Node WebSocket relay.

## What's here

- `scripts/voice-ws.ts` — Node WS server on `:3001`. Holds the HTTP/2
  bidirectional stream to Bedrock for the life of a session.
- `public/voice-worklet.js` — AudioWorklet that downsamples the mic to
  16 kHz mono PCM16 and posts 1024-sample frames.
- `src/components/chat/voice-button.tsx` — Mic capture, WS connection,
  PCM playback at 24 kHz, transcript callback.
- Hooked into the existing composer in `src/routes/index.tsx` next to
  Send/Stop. Text chat path is unchanged.

## Run

In two terminals (from repo root):

```sh
pnpm --filter @govtech-bb/chat voice:ws   # starts ws://localhost:3001
pnpm --filter @govtech-bb/chat dev        # starts http://localhost:3000
```

Open the chat, click **Voice**, allow mic access, talk. Click **Stop voice**
to end the session.

## Required environment

The WS server uses the standard AWS credential chain (`~/.aws/credentials`,
`AWS_PROFILE`, `AWS_*` env vars). The IAM principal needs:

```
bedrock:InvokeModelWithBidirectionalStream
  on arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-2-sonic-v1:0
```

**Enable model access in the Bedrock console** before first run:
https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess
→ request access to `Amazon Nova 2 Sonic`. Without this, the first call
returns `AccessDeniedException` even with the IAM statement above.

Optional overrides:

| Var | Default |
| --- | --- |
| `VOICE_WS_PORT` | `3001` |
| `VOICE_BEDROCK_REGION` | `us-east-1` |
| `VOICE_MODEL_ID` | `amazon.nova-2-sonic-v1:0` |
| `VOICE_VOICE_ID` | `matthew` |

## Known POC limits (deferred to v2)

- **Hosting** — runs locally only. Amplify Hosting Compute cannot hold a
  long-lived WebSocket. Production needs a separate runtime
  (ECS/Fargate, App Runner) or API Gateway WebSocket + Lambda.
- **Session length** — Nova Sonic caps a session at 8 minutes. No
  continuation handling yet.
- **Turn-taking** — uses Sonic's built-in VAD. Push-to-talk is a
  follow-up for noisy real-world conditions.
- **Bajan Creole accuracy** — untested. Verify with at least 10 phrases
  across 3 speakers before showing to citizens.
- **Trust UI** — the citizen-facing "your voice is not stored" assurance
  is not yet in the UI. Add before any user testing.
- **Transcript display** — the `onTranscript` callback fires but isn't
  rendered into chat bubbles yet.
