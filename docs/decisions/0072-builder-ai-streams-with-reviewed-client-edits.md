# 0072 — Builder AI streams with reviewed client edits

Status: accepted
Date: 2026-09-09
Amended: 2026-09-12 — permission modes, harness layout, and service workspace targets
Supersedes the AI transport and apply flow in ADR 0022; retains ADR 0047's
repairable-draft rule and ADR 0042's editing-claim requirement.

## Decision

Form, content, and service workspace authoring share an assistant in
`components/ui/ai`, built on TanStack AI, its React client, official Bedrock
adapter, and TanStack Markdown.
The private Bedrock adapter is removed; the workspace package retains only
model aliases and static stream helpers consumed by citizen chat.

An authenticated Start function obtains a 60-second, origin-bound bearer
token using the server admin credential. Chat streams directly from the
browser to the API, bypassing Amplify's 28-second SSR limit. The server owns
the prompts and tool allowlist, bounds requests and concurrency, sanitizes
provider errors, and logs timing/outcome metadata without prompt or document
content. No model job store, fenced-JSON extractor, or custom stream protocol
is retained. Legacy AI endpoints return 410.

Ask and Auto are client-side approval policies, persisted per conversation;
new or unrecognized permissions default to Ask. Both offer edit tools when
the current context is editable. Only `readOnly` sets the server capability
to `context.mode = "ask"` and removes edit tools. The service workspace is
editable without opening a document.

All edit tools retain TanStack's native tool-approval interrupt. Ask presents
the prepared before/after candidate for explicit approval. Auto prepares and
validates the same candidate, then resolves only live approvals for
`apply_form_draft`, `apply_content_patch`, and `update_service_details`.
Publish, delete, attach/detach, and restore tools are deferred and excluded
from this allowlist. Unknown gated tools still require human approval.
Warnings remain visible after application. Preparation failures return an
`applied: false` tool result without applying data, allowing the model to
correct its proposal. Success is reported only after execution completes.

Execution consumes a single-use prepared change and requires a live run
binding, mounted/open assistant, and editable capability. Local edits must
still match the run-bound document revision after validation and at execution.
External targets retain the run binding but use the captured service draft
revision for optimistic concurrency. Stop, closure, or restoration cannot
leave an executable approval behind.

Malformed proposals and validation transport failures block application.
Semantic validation issues may become a repairable draft with visible warnings.
Publishing remains strict. Form application preserves payment/MDA settings,
existing credentials, opaque metadata, and fixed identifiers; content patches
use the existing allowlisted patch helper and preserve fixed paths/form links.

Proposals without a target address the open document. Explicit service/page
targets use the open editor when they match it; other targets reuse the same
preparation helpers and save through `saveServicePage`, `saveServiceForm`, or
`saveServiceDraft`. These drafts are browser-scoped, per user, and revisioned;
the existing store uses `navigator.locks` when available. Changed recipes also
pass through `saveServiceRecipe` and its API editing-claim checks. Open-editor
changes remain local until the author's existing save flow. No tool publishes.

`read_service`, `read_page`, and `read_form` run on the client because the API
cannot access browser drafts. Reads and target edits require membership in
`listServiceDrafts()`; read outputs are redacted and capped at 200,000 serialized
characters. Context includes up to 50 adopted service index entries. Services
that exist only in published content must first be opened in the workspace.
The workspace prompt combines form/content guidance and requires reading a
target before editing it. `service-draft-saved` refreshes workspace state and
advances an open editor's service revision when its own document is unchanged.

One assistant stays mounted above builder navigation. Desktop Expand hides
the mounted editor and presents a conversation rail, thread, and Preview/Changes
artifact pane; Narrow restores the dock. Compact layouts retain the modal
thread. Preview reuses the service journey preview for the current editor;
Changes reuses the validated diff. A manual tab choice lasts until a new
proposal. No new rendering dependencies are introduced.

TanStack IndexedDB persistence stores inert conversation text, scoped by user
and workspace (standalone assistants retain artifact scope). The conversation
index stores each permission. Tool arguments/results become readable summaries
and pending resume instructions are discarded. History never serves as a draft backup.
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

Auto retains the existing three-request approval/resume/client-tool flow;
the 20-request-per-minute user limit therefore permits roughly six such edits
per minute before other traffic. The workspace index is limited to adopted
browser drafts, and service setup state may remain stale until navigation.

The official Bedrock 0.3.7 package currently needs a small pnpm patch to forward
AbortSignal into its AWS SDK sends. Remove that patch once an upstream release
includes the fix. Integration tests exercise the actual TanStack protocol and
official adapter with mocked AWS, including approval and cancellation after
a stream exceeds 28 seconds. Production AWS permissions/model access still
need the environment's normal deployment smoke check.

References: [TanStack AI](https://tanstack.com/ai/latest/llms.txt),
[official Bedrock adapter](https://tanstack.com/ai/latest/docs/adapters/bedrock),
[TanStack Markdown](https://tanstack.com/markdown/latest/llms.txt).
