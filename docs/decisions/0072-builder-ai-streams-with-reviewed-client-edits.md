# 0072 — Builder AI streams with reviewed client edits

Status: accepted
Date: 2026-09-09
Supersedes the AI transport and apply flow in ADR 0022; retains ADR 0047's
repairable-draft rule and ADR 0042's editing-claim requirement.

## Decision

Form and content authoring share an assistant in `components/ui/ai`, built on
TanStack AI, its React client, official Bedrock adapter, and TanStack Markdown.
The private Bedrock adapter is removed; the workspace package retains only
model aliases and static stream helpers consumed by citizen chat.

An authenticated Start function obtains a 60-second, origin-bound bearer
token using the server admin credential. Chat streams directly from the
browser to the API, bypassing Amplify's 28-second SSR limit. The server owns
the prompts and tool allowlist, bounds requests and concurrency, sanitizes
provider errors, and logs timing/outcome metadata without prompt or document
content. No model job store, fenced-JSON extractor, or custom stream protocol
is retained. Legacy AI endpoints return 410.

Ask cannot invoke edit tools. Review edits pauses through TanStack's native
tool-approval interrupt. The client prepares and validates a normalized
before/after candidate, then applies that exact candidate once following
explicit approval. The draft revision and editing claim are checked after
validation and again at execution. Stale/restored proposals and closed
assistants cannot apply. Model output never saves or deploys.

Malformed proposals and validation transport failures block Apply. Semantic
validation issues may become a repairable draft with visible warnings. Save
and Deploy remain strict. Form application preserves payment/MDA settings,
existing credentials, opaque metadata, and fixed identifiers; content patches
use the existing allowlisted patch helper and preserve fixed paths/form links.

TanStack IndexedDB persistence stores inert conversation text, scoped by user
and artifact. Tool arguments/results become readable summaries and pending
resume instructions are discarded. History never serves as a draft backup.
Deletion removes the transcript and document reference; storage failures are
reported. Recognized credential fields are redacted from model snapshots.

Documents use direct S3 POST policies (PDF 20 MB; PNG/JPEG 10 MB), API metadata
and signature verification, and owner-bound signed references. Textract
retries use the same upload/job. References expire; retries after expiry
require another upload. Stop disconnects chat and aborts local upload/polling;
Textract may continue remotely.

## Operational consequences

Configure exact editor origins in `CORS_ORIGIN`, a browser-reachable
`BUILDER_API_URL`, S3 CORS, and the existing AWS IAM permissions. Streaming
responses must pass through the load balancer without buffering. Heartbeats
run every 15 seconds and the API caps a request at 180 seconds. User rate and
concurrency limits are per process; a shared limiter is needed for a larger
service fleet. History remains on one browser and does not sync across devices.

The official Bedrock 0.3.7 package currently needs a small pnpm patch to forward
AbortSignal into its AWS SDK sends. Remove that patch once an upstream release
includes the fix. Integration tests exercise the actual TanStack protocol and
official adapter with mocked AWS, including approval and cancellation after
a stream exceeds 28 seconds. Production AWS permissions/model access still
need the environment's normal deployment smoke check.

References: [TanStack AI](https://tanstack.com/ai/latest/llms.txt),
[official Bedrock adapter](https://tanstack.com/ai/latest/docs/adapters/bedrock),
[TanStack Markdown](https://tanstack.com/markdown/latest/llms.txt).
