---
name: Gov BB authoring assistant
description: A shared authoring chat, draft review, and contextual preview using the builder design tokens.
reference: https://github.com/slev12397/beautiful-ui/tree/main/app/harness
typography:
  family: Inter
  reply: 13px / 1.75
  welcome: 26px / normal
  activity: 13px
  supporting: 12px
  code: 12px / 1.7 monospace
---

# Gov BB authoring assistant

The assistant follows [beautiful-ui’s harness](https://github.com/slev12397/beautiful-ui/blob/main/components/site/IceCreamHarness.tsx) and its component composition while retaining the builder’s tokens, Inter typography, Hugeicons, shared controls, and light/dark themes. The visual changes apply to the shared assistant and its development demo.

## Layout and tokens

- The assistant opens in a 450px dock, resizable from 360px to 720px; keyboard resizing uses 20px steps. Expand shows the same chat at full width. The editor stays mounted while hidden, and Narrow restores it.
- Both views use one header with the conversation dropdown, New conversation, conversation actions, Expand/Narrow, and Close. Delete chat lives in conversation actions. New conversation is disabled at 50 conversations.
- Expanded messages occupy a reading column up to 720px wide. Assistant replies sit directly on the thread surface; user messages use a subdued bubble. Message groups have generous spacing, and reply actions appear on hover or keyboard focus.
- Empty chat centers a two-line greeting, the composer, and three plain suggestion rows. During conversation, the composer floats above a soft token-colored fade. A height observer reserves scrolling space; the same textarea remains mounted across first send, Expand, and Narrow. Scroll-follow releases when the author reads earlier messages, and Jump to latest restores it.
- The expanded right pane appears for a new proposal or explicit Preview. Closing persists for the current proposal; a new proposal reopens Changes. Manual tab selection survives validation updates. The pane occupies the smaller of 400px and 40% of the container.
- At 1023px or below, the assistant is a full-width modal with dynamic viewport height. Resize, Expand, and the artifact pane are unavailable. Composer spacing includes the bottom safe area.

Use `ui-base` for the thread and principal surfaces, `ui-canvas` around expanded panels, and `ui-recessed`/`ui-tint` for quieter controls. Primary text uses `ui-default`; supporting copy uses `ui-subtle`. Actions retain `ui-brand` and `ui-inverse`; state indicators use existing success, warning, and danger tokens with text or symbols alongside color. Dividers use `ui-hairline`. Local surfaces and controls use the established radius and elevation utilities; no global palette or typography changes are introduced.

Motion uses existing duration/easing tokens and respects reduced motion. Streaming, activity, elapsed time, and completion represent actual runtime state.

## Components

| Component         | Implemented treatment and behavior                                                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection Actions | A compact contextual bar exposes Explain and Improve, with Shorten, Fix grammar, and custom instructions under More. It captures the actual Visual/Markdown editor selection, then opens and prefills chat without sending or editing. Source changes invalidate the selection. Escape and Dismiss close the bar.                  |
| Code Block        | A compact filename header, Copy feedback, line-number gutter, and explicit added/removed signs are shared by Markdown, tool details, and diffs. Code scrolls within 320px. Clipboard failures remain visible; the text remains selectable. The bounded prefix/suffix diff preserves both versions without promising minimal hunks. |
| Prompt Bar        | One elevated surface contains a transparent textarea, attachment/context chips, and a compact toolbar for attachment, Ask/Auto, and Send/Stop. Focus outlines the surrounding composer. References and slash commands insert editable text; they never send automatically.                                                         |
| Chat              | Borderless assistant replies, subdued user bubbles, one compact header, a centered reading column, quiet reply controls, and the shared floating composer. No separate history sidebar or conversation tabs.                                                                                                                       |
| Task Rows         | Expandable capsules show step indicators, status, details, and Retry for real upload/extraction stages. Retrying extraction reuses the upload. A single draft validation uses Loading State instead.                                                                                                                               |
| Tool Chips        | Compact tool labels, contextual chips, and subtle chevrons expose redacted inputs/results on expansion. Status follows running, waiting, complete, failed, or interrupted tool execution.                                                                                                                                          |
| Approval Card     | One question appears in a restrained surface with native radio/checkbox choices, custom answers, a compact counter/navigation row, and footer actions. Selecting an answer does not advance or send. Continue, Send answers, Skip, and Skip all are explicit; submission failures remain retryable.                                |
| Streaming Text    | A small wrapper renders incoming TanStack Markdown immediately with a visual cursor while streaming. HTML is disabled, links use allowed URL schemes, and Markdown images become text alternatives. Code uses the shared Code Block.                                                                                               |
| Thinking          | A compact expandable activity heading reveals actual tool work, opens while working, and collapses after completion unless manually toggled. It does not invent reasoning or a timeline.                                                                                                                                           |
| Loading State     | A small pixel indicator and one accessible status label, with an optional measured elapsed timer. Animation is decorative; text communicates progress.                                                                                                                                                                             |

Draft-change review uses a single compact surface with summary, one validation/error-and-retry area, visible warnings, and Apply/Reject. Apply stays disabled until a current, nonempty change has been prepared. Warnings change the label to “Apply with warnings.” Full change details live in the open pane; otherwise an inline disclosure exposes them. Warnings appear only once within the review card.

Applied changes become compact, initially collapsed outcome rows, retaining the changed-section count, warning badge, summary, diff, and outcome message. The trigger stays stable from validation to completion. Failed outcomes show their error outside the collapsed details.

The contextual pane has Preview/Changes tabs and Close. An explicit request selects its tab once; a new proposal defaults to Changes. Its pending message is not a second live validation announcement. Preview embeds the existing service journey and refreshes with the artifact revision. External-target changes keep their diff even when the current editor preview represents another document.

## Input, persistence, and attachments

Ask is the default per conversation. The conversation index stores Auto only for that conversation. The permission control and menu use neutral styling without selected backgrounds or checkmarks; the label identifies the current mode and radio semantics remain accessible. The label stays visible while busy/pending and displays Ask when read-only. Read-only capability removes edit tools; Ask itself still permits proposed edits for explicit approval.

The prompt supports current-draft, selected-text, and ready-document references through `@`, plus `/review`, `/simplify`, `/structure`, and `/summarize`. Arrow keys choose, Enter inserts, and Escape dismisses the menu. Outside the menu, Enter sends and Shift+Enter adds a line. Pending questions or proposal review block new input; unready attachments block Send.

One PDF up to 20 MB or PNG/JPEG up to 10 MB enters through the picker, drop, or paste. Attachment cards show filename, size, actual status, and Remove. PDFs lazily render their first page with bundled PDF.js; local images use object URLs. Local files and preview data are not persisted: restored cards retain metadata and a type fallback. Saved conversation data retains attachment metadata and native document/image parts. Private originals reach the model through authenticated Textract text, not public preview URLs.

Conversation history and permissions are scoped to the user and workspace in this browser. Storage failures are surfaced rather than implying that history was saved. Restored transcripts are inert and cannot resume tool execution or Auto approval.

## Runtime invariants

- Ask requires explicit approval after guarded preparation. Auto uses the same preparation/execution path and only permits `apply_form_draft`, `apply_content_patch`, and `update_service_details`. Warnings remain inspectable; failed execution is reported to the model.
- Every execution requires a live run binding, an open mounted assistant, editable capability, and a single-use prepared change. Stop, close, and invalidated runs cannot apply delayed results. Open-document revision drift invalidates local changes.
- Open-document edits update the current editor draft. Other service targets use the existing browser-scoped workspace save methods and captured expected revision; changed recipes also use API save and editing-claim checks. External targets retain optimistic concurrency protection.
- Read tools require membership in adopted browser drafts, redact sensitive values, and reject results above 200,000 serialized characters. The model receives at most 50 service index entries; published-only services must first be opened in the workspace.
- Saved-draft events refresh workspace state and advance open-editor revisions when their own document is unchanged. Publishing, deleting, attaching/detaching, and restoring are outside the Auto allowlist. A selection action, question answer, or draft save never implies publishing.

Implementation: [assistant](./assistant.tsx), [global editor integration](../../global-assistant.tsx), [tokens](../styles/tokens.css), and [motion](../styles/motion.css). The development route `/dev/assistant` exercises the shared components and scripted chat transport without requiring a model connection.
