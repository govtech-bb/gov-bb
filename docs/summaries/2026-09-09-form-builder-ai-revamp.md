# Form-builder AI revamp — 2026-09-09

Replaced the form and content editors' legacy AI generation/polling flows with
TanStack AI streaming, the official Bedrock adapter, and TanStack Markdown.
The shared assistant and reusable components live under `components/ui/ai`.
They support document attachments and previews, live tool activity,
clarification questions, reviewed changes, and contextual selection actions.

Proposals apply only to the current local draft after review and validation.
Revision and editing-claim checks prevent stale application; restored history
cannot execute tools. Existing protected configuration and explicit Save/Deploy
flows are preserved. ADR 0072 records the transport and review decisions.

The Bedrock 0.3.7 patch forwards cancellation to the AWS SDK. Docker contexts
include the patch, and the dependency consistency check permits the form
builder's newer AI client alongside citizen chat's existing version.

Validation: 20 build targets passed (landing excluded per local guidance);
1,211 tests passed and 5 skipped across the frontend, API, and shared packages.
Dependency consistency and source typechecking passed. Desktop/mobile browser
checks covered attachments, questions, review/apply, and selection actions
with mocked model responses. Live AWS and Docker image builds were not run.
