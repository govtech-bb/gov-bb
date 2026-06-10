# Optional context prompt through the PDF/image upload (#1121)

## Context

In the form-builder AI sidebar, uploading a PDF/image and typing a prompt were
two decoupled actions — the upload path silently ignored whatever was in the
prompt box ([#1121](https://github.com/govtech-bb/gov-bb/issues/1121)). So you
got a blind PDF→recipe convert with no way to steer it ("only extract the
personal-details section", "make every field optional", "skip the payment
page"). The prompt textarea was wired only to *Edit Form*, which operates on an
already-loaded draft — unreachable for a fresh upload.

Resolved on `1121-upload-context-prompt` (targets `sandbox`).

## What we did

Plumbed an optional `context` string through the full vertical slice — UI →
server fn → `form_builder_api` convert — so a prompt typed alongside an upload
steers the conversion. Empty box → unchanged blind convert.

- **UI** (`apps/form_builder/.../-ai-sidebar.tsx`): `handleUpload` reads
  `input.trim()`, forwards it as `context`, clears the box, and reflects it in
  the transcript bubble (`📎 Uploaded <name>\n<context>`). On a failed upload it
  restores the typed context to the box so the user needn't retype it.
- **Server fn** (`apps/form_builder/.../ai-builder/convert.ts`):
  `startPdfConvert`'s validator widened to `{ s3Key, context?: string }`;
  `context` forwarded in the `/process` body only when present.
- **Backend** (`apps/form_builder_api/.../ai-upload.ts`): `processHandler`
  trims + length-caps `context` (400 on overflow) and stashes it in a new
  `contextByJobId` map keyed by Textract JobId; `runBedrock` takes the context
  and injects it into the Bedrock `userText`; the entry is consumed (captured
  into the call, then deleted) when Bedrock kicks off, and swept alongside the
  bedrock-state map.
- **Tests** on both sides: backend (context accepted/stashed, over-length 400,
  context injected into the captured Bedrock user message, no-context path keeps
  the verbatim base prompt), frontend (file+text → `startPdfConvert({ s3Key,
  context })` + box cleared + transcript shows it; empty box omits `context`;
  failed upload restores the context).

## Why we did it that way

- **A keyed in-memory map bridges the two-phase async job.** The convert is two
  requests: `POST /upload/process` kicks off Textract and returns a `jobId` —
  this is where `context` *arrives* — but Bedrock runs **later**,
  fire-and-forget, during a `GET /upload/status/:jobId` poll — where `context`
  is *consumed*. So it can't be a local variable; it has to survive the gap. We
  stash it in `contextByJobId`, mirroring the existing `bedrockStateByJobId`
  pattern and its single-ECS-task / sweep assumptions.
- **Rejected: thread context through every `/status` poll.** The client already
  discards `input` after firing, the poll loop would have to carry state it
  otherwise doesn't, and it buys nothing over the keyed map given the
  single-task model the file already relies on.
- **Capture-before-delete avoids a race.** `statusHandler` evaluates
  `contextByJobId.get(jobId)` synchronously into `runBedrock`'s argument, *then*
  deletes the key — so the async Bedrock run keeps its copy. The
  concurrent-poll double-kick is already guarded by the existing `running`
  re-check, so only one poll deletes.
- **Length cap at the real trust boundary.** The 2000-char cap (matching the
  `.max(2000)` convention in `forms.ts`) is enforced server-side in
  `processHandler`, not in the server fn — the backend caps authoritatively.
  `context` is plain user text concatenated into the Bedrock prompt; the cap
  bounds the prompt-injection surface, and recipe validation + the Deploy gate
  remain the hard boundary for whatever the model emits.
- **Kept separate Upload + Send buttons.** Merging them into one affordance is a
  larger UX change for no extra capability; the separate-button layout already
  exists and is tested.
- **Restore typed context on a failed upload.** The upload path has several
  failure points (presign, S3 PUT, convert) — more than the synchronous Edit
  path — so clearing the box up front and losing the text on failure costs more
  here. The `catch` restores it (only when the box is still empty, so a new
  prompt the user started meanwhile isn't clobbered).

## Out of scope / follow-up

- **Send vs Upload when a file is attached.** The textarea still drives both
  Upload (new) and Send/`handleEditForm` (existing). On a fresh upload there's
  no draft, so clicking Send would hit the edit path with nothing loaded.
  Acceptable for v1 (labels/placeholder guide the user); disabling/relabelling
  Send while a file is attached is the obvious follow-up nudge.
- **Task-restart window.** If the ECS task restarts mid-job, the next poll
  re-kicks Bedrock from the retained Textract result, but the context map entry
  is gone, so it falls back to no-context. Rare, degrades gracefully; not worth
  persisting context to survive a restart.
- **Manual smoke** (upload a PDF with a steering prompt, confirm the recipe
  reflects it; repeat with an empty box for the unchanged blind convert) to be
  performed in a real browser before merge.
