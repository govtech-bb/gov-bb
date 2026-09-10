---
name: Gov BB authoring assistant
description: A contextual conversation and review panel within the existing authoring interface.
colors:
  ui-base: "var(--ui-base)"
  ui-surface-2: "var(--ui-surface-2)"
  ui-canvas: "var(--ui-canvas)"
  ui-tint: "var(--ui-tint)"
  ui-hairline: "var(--ui-hairline)"
  ui-line: "var(--ui-line)"
  ui-brand-hover: "var(--ui-brand-hover)"
  ui-brand: "var(--ui-brand)"
  ui-default: "var(--ui-default)"
  ui-inverse: "var(--ui-inverse)"
  ui-success-text: "var(--ui-success-text)"
  ui-danger-text: "var(--ui-danger-text)"
  ui-danger-tint: "var(--ui-danger-tint)"
typography:
  body:
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "14px"
    lineHeight: 1.6
    letterSpacing: "-0.15px"
  markdown:
    fontSize: "14px"
    lineHeight: 1.65
  heading:
    fontSize: "16px"
    lineHeight: 1.4
  label:
    fontSize: "12px"
  activity:
    fontSize: "13px"
    fontWeight: 500
  code:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
    lineHeight: 1.7
rounded:
  rad-s: "6px"
  rad-m: "8px"
  rad-l: "12px"
spacing:
  gap: "8px"
  inset: "12px"
  section: "16px"
components:
  button-primary:
    backgroundColor: "{colors.ui-brand}"
    textColor: "{colors.ui-inverse}"
    rounded: "{rounded.rad-m}"
    padding: "7px 10px"
  button-primary-hover:
    backgroundColor: "{colors.ui-brand-hover}"
  button-secondary:
    backgroundColor: "{colors.ui-base}"
    textColor: "{colors.ui-default}"
    rounded: "{rounded.rad-m}"
    padding: "7px 10px"
  button-secondary-hover:
    backgroundColor: "{colors.ui-tint}"
  conversation-select:
    textColor: "{colors.ui-default}"
    padding: "6px 0"
  mode-select:
    backgroundColor: "{colors.ui-canvas}"
    textColor: "{colors.ui-default}"
    typography: "{typography.label}"
    rounded: "20px"
    padding: "6px 8px"
  composer:
    backgroundColor: "{colors.ui-base}"
    textColor: "{colors.ui-default}"
    rounded: "16px"
  assistant-message:
    backgroundColor: "{colors.ui-base}"
    textColor: "{colors.ui-default}"
    rounded: "{rounded.rad-l}"
    padding: "15px"
  review-card:
    backgroundColor: "{colors.ui-base}"
    textColor: "{colors.ui-default}"
    rounded: "{rounded.rad-l}"
    padding: "16px"
  loading-state:
    textColor: "{colors.ui-brand-hover}"
    typography: "{typography.activity}"
  code-block:
    backgroundColor: "{colors.ui-canvas}"
    textColor: "{colors.ui-default}"
    typography: "{typography.code}"
    rounded: "{rounded.rad-m}"
  clarification-question:
    textColor: "{colors.ui-default}"
  attachment-card:
    backgroundColor: "{colors.ui-canvas}"
    textColor: "{colors.ui-default}"
    rounded: "{rounded.rad-m}"
    padding: "8px"
---

# Design System: Gov BB authoring assistant

## Overview

**Creative North Star: "The contextual authoring assistant"**

This record covers only `app/components/ui/ai`. The assistant inherits the authoring application's neutral light/dark surfaces, Inter typography, and compact native controls. Conversation and review remain close to the current form or content page.

The panel uses restrained tonal separation and readable evidence. Its visual hierarchy leads from the current artifact through conversation to an explicit decision about proposed changes.

**Key Characteristics:**

- Neutral surfaces that follow the host theme.
- Compact Inter text with generous conversation line spacing.
- Native controls and disclosures with visible keyboard focus.
- Unified before/after changes presented with validation before Apply.
- Activity and attachment states driven by the current operation.

Evidence: [PRODUCT.md](../../../../PRODUCT.md), [assistant.tsx](./assistant.tsx), and [theme tokens](../styles/tokens.css). This is a record of implemented components, not a new application identity.

## Colors

A warm neutral surface family becomes a charcoal family in dark mode. Frontmatter colors retain the actual CSS custom-property bindings so they follow both themes; their values remain owned by [the content theme](../styles/tokens.css) and [the matching builder theme](../../../styles/builder.global.css).

### Primary

- **Inverse action:** `ui-brand` with `ui-inverse` identifies Apply and Send; hover uses `ui-brand-hover`.

### Secondary

- **Success and additions:** the existing `ui-success-text` token marks completed tasks and added lines, falling back to `ui-default` where the host supplies no success color.
- **Errors and removals:** `ui-danger-text` and `ui-danger-tint` mark failed activity and removed lines. Status text and addition/removal signs preserve meaning without color.

### Neutral

- **Panel and cards:** `ui-surface-2` backs the dock; `ui-base` backs the header, assistant messages, review cards, and composer.
- **Inset surfaces:** `ui-canvas` backs code, tool chips, attachment cards, warnings, and selected or hovered question options. `ui-tint` backs user messages and secondary-button hover.
- **Dividers:** `ui-hairline` separates regions; `ui-line` outlines controls and review cards.
- **Readable copy:** `ui-default` carries primary text. `ui-brand-hover` carries supporting text, solid loading labels, and prompt/question placeholders at full opacity.

**The Theme Pairing Rule.** Keep inverse actions paired with `ui-inverse`, and retain solid `ui-brand-hover` for loading labels and prompt/question placeholders across themes.

Evidence: [actions and supporting text](./assistant.tsx), [shared color roles](../styles/tokens.css).

## Typography

Inter and its existing sans-serif fallback stack are inherited from the host. Body copy uses the compact body role; Markdown has a slightly more open reading rhythm, with all rendered heading levels constrained to the same heading size. Tool activity, warnings, and review support use the label size.

The welcome title is a local introduction (22px, weight 550, tracking -0.6px), not a reusable application display scale. Conversation titles use weight 550. Code fences, tool payloads, and unified diffs share the monospace code role, with wrapped lines and explicit addition/removal signs. Elapsed time and question counters use tabular numbers.

Evidence: [host type](../../../styles/builder.global.css), [welcome and Markdown](./assistant.tsx), [code](./code-block.tsx) and [activity text](./loading-state.tsx).

## Layout

On desktop, the assistant occupies a right dock beside the editor. It starts at 450px, resizes between 360px and 720px, and supports keyboard resizing in 20px steps. Expanded width is capped at the smaller of 720px and 55vw. A fixed header and anchored composer frame the independently scrolling conversation. The empty conversation supplies three starter actions.

At viewport widths of 1023px or below, the same native dialog opens modally at full viewport width and dynamic viewport height. Resize and expand controls disappear; buttons have a 36px minimum height and the composer respects the bottom safe area. At 48rem or below, prompt and question fields and the selection instruction input use 16px text; the shortcut hint is hidden.

Spacing is compact around controls and more open between messages. Review disclosures contain one unified before/after diff, with line numbers and added/removed counts. Code regions scroll within 320px; attachment activity scrolls within the smaller of 240px and 25dvh inside the composer. Prompt menus open above it. Clarification questions appear one at a time inside the existing assistant message.

Evidence: [dock sizing and dialog behavior](./assistant.tsx), [resize control](./assistant.tsx), [dock responsive rules](./assistant.tsx), [prompt](./prompt-bar.tsx), [question](./approval-card.tsx), and [selection layout](./selection-actions.tsx).

## Elevation & Depth

Borders and tonal surfaces establish depth. The conversation alone carries a faint dotted field; this local texture is not a global background rule. Jump to latest, the prompt menu, and selection actions use small local shadows; the compact modal uses a translucent backdrop. Clarification questions are borderless within the assistant message, with the question legend carrying the heading. These local treatments do not establish a general card-elevation scale.

New messages, questions, and selection actions use short opacity/vertical entrances. Activity pixels and spinners animate only when reduced motion is not requested. Loading labels remain solid; a real elapsed timer accompanies the pixels. Text communicates status independently of animation.

Evidence: [feed texture](./assistant.tsx), [floating control](./assistant.tsx), [message motion](./assistant.tsx), [shared animations](../styles/motion.css) and [selection actions](./selection-actions.tsx).

## Shapes

Use the existing small radius for warnings and question options; medium for buttons, code blocks, and attachment cards; large for assistant messages and review cards. The prompt has its own softer silhouette (16px). Task rows change from a pill to the large radius when expanded. User messages retain an asymmetric corner, the mode selector is pill shaped, and Send is circular. Clarification questions add no enclosing card. These silhouettes identify component roles rather than introducing new global radius tokens.

Evidence: [messages](./assistant.tsx), [review](./assistant.tsx), [prompt](./prompt-bar.tsx), [tasks](./task-rows.tsx), [attachments](./attachments.tsx), and [questions](./approval-card.tsx).

## Components

- **Actions and conversation:** bordered secondary buttons, inverse primary buttons, transparent header controls, and a native conversation select. Keyboard focus remains visible. The prompt uses one surrounding focus outline; its native file input remains transparent when disabled while the attachment control dims.
- **PromptBar:** native textarea with Review edits/Ask modes and Send/Stop. `@` inserts a reference to the current draft, an existing selection, or a ready attached document; `/review`, `/simplify`, `/structure`, and `/summarize` insert editable instructions. Arrow keys choose, Enter inserts, and Escape dismisses the menu. Outside it, Enter sends and Shift+Enter adds a line. Pending questions or proposal review block new input; unready attachments block Send. Ask remains read-only.
- **Attachments:** one PDF (up to 20 MB) or PNG/JPEG (up to 10 MB) enters through the file picker, drop, or paste. Composer cards show filename, size, real status, and Remove; saved chat retains attachment metadata and native image/document parts. Local images use object URLs; PDFs lazily render the first page with bundled PDF.js and its worker. Local files and preview data are not persisted, so restored cards retain file identity with a type fallback. Private originals are represented to the model by authenticated Textract text, not public preview URLs.
- **LoadingState, ThinkingState, and ToolChips:** pixel activity and a measured elapsed timer accompany a solid status label. Expandable activity contains actual tool calls and their running, waiting, complete, failed, or interrupted state; disclosures show redacted inputs/results. It records observable work, not invented reasoning or a fabricated timeline.
- **TaskRows:** native disclosures expose upload, extraction, and draft-validation progress. Waiting, In progress, Completed, Failed, and Paused labels follow real state. Retry targets the failed stage; extraction retries reuse the existing upload.
- **ApprovalCard:** `ask_questions` supplies native radio or checkbox choices plus a custom answer. A borderless fieldset shows one question at a time inside the assistant reply. Selecting an option does not advance or send; navigation, Continue, Send answers, Skip, and Skip all questions are explicit. Sending errors remain retryable. Answers return to the conversation and do not apply draft changes.
- **Messages and CodeBlock:** user text retains its tinted bubble; assistant replies retain the bordered surface. TanStack Markdown streams replies with HTML disabled and underlined links. Code fences, tool payloads, and proposal diffs share line-numbered, scrollable CodeBlock output and Copy feedback. Markdown images remain text alternatives; document attachments use the separate metadata/thumbnail cards.
- **ReviewCard:** a populated summary identifies changed sections. Native disclosures show unified before/after changes with removed/added signs and counts. Validation, stale, no-change, error, and warning states remain explicit. Apply is disabled until a nonempty current proposal is prepared; warnings change its label to “Apply with warnings.”
- **SelectionActions:** the content editor's real Visual or Markdown selection offers Improve, Shorten, Fix grammar, Explain, and a custom instruction. An action opens and prefills the assistant with the selected text; the author still sends the request and reviews proposed edits. A changed source invalidates the selection.

**The Review Before Apply Rule.** Keep the proposed values and validation state available beside an explicit Apply action. Apply changes only the local draft; the author retains the existing Save or Deploy step.

Evidence: [assistant integration](./assistant.tsx), [prompt](./prompt-bar.tsx), [attachment card](./attachments.tsx), [local thumbnails](./file-thumbnail.tsx), [attachment parts](./attachment-data.ts), [saved transcript](./history.ts), [authenticated document transport](./transport.ts), [loading](./loading-state.tsx), [activity](./thinking-state.tsx), [tool details](./tool-chips.tsx), [tasks](./task-rows.tsx), [questions](./approval-card.tsx), [code/diff](./code-block.tsx), [review](./review.tsx), [selection](./selection-actions.tsx), and [editor integration](../../body-editor/body-editor.tsx).

## Do's and Don'ts

### Do:

- Do inherit the host theme, Inter stack, and existing radius tokens.
- Do preserve native controls, keyboard focus, and the compact modal behavior.
- Do present unified before/after changes and validation before enabling Apply.
- Do bind activity, question choices, references, and file states to the actual conversation.
- Do keep loading labels and prompt/question placeholders solid and readable with the supporting-text token.

### Don't:

- Don't hardcode a light-theme foreground on inverse actions.
- Don't imply that a selection action, question answer, or Apply saves or deploys the artifact.
- Don't promote the conversation texture or local message silhouettes into application-wide rules.
