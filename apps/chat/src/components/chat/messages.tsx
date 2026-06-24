import { Fragment, type ReactNode, useLayoutEffect, useRef } from "react";
import type { UIMessage } from "@tanstack/ai";
import { useVirtualizer } from "@tanstack/react-virtual";
import { restoreLinks, type LinkTokenMap } from "#/lib/chat/link-tokens";
import type { Citation } from "#/lib/rag/types";
import type { PresentedField } from "#/lib/chat/tools/present-field";
import {
  AssistantBubble,
  ErrorBubble,
  NoticeBubble,
  UserBubble,
  WelcomeBubble,
} from "./bubbles";
import { Markdown } from "./markdown";
import { FieldWidget } from "./field-widget";
import { ChoicePrompt } from "./choice-prompt";
import { ApprovalCard } from "./approval-card";
import { ThinkingBubble } from "./thinking";

// A part that is a live presentField tool-call → its contract-derived field
// spec (the server's PresentedField, never model args), else null. The single
// narrowing for "the model is asking this field", reused wherever a part is
// classified.
function presentedField(part: unknown): PresentedField | null {
  const tc = part as { type?: string; name?: string; output?: unknown };
  return tc.type === "tool-call" && tc.name === "presentField" && tc.output
    ? (tc.output as PresentedField)
    : null;
}

// Field metadata for the approval card, harvested from every presentField
// output in the thread (the contract's data, never a model slug). Both pieces
// come from the same outputs, so one walk: `labels` (fieldId → question label;
// missing ids fall back to a humanised slug in the card) and `optionLabels`
// (fieldId → option value → label, since submit args carry option VALUES but the
// card should show the LABEL).
function collectFieldMeta(messages: ReadonlyArray<UIMessage>): {
  labels: Record<string, string>;
  optionLabels: Record<string, Record<string, string>>;
} {
  const labels: Record<string, string> = {};
  const optionLabels: Record<string, Record<string, string>> = {};
  for (const m of messages) {
    for (const part of m.parts ?? []) {
      const o = presentedField(part);
      if (!o?.found) continue;
      if (o.label) labels[o.fieldId] = o.label;
      if (o.options?.length) {
        const map = (optionLabels[o.fieldId] ??= {});
        for (const opt of o.options) map[opt.value] = opt.label;
      }
    }
  }
  return { labels, optionLabels };
}

// Render a message's parts IN ORDER, by type — narrow the real discriminated
// union, no shape cast. Handles `text` (assistant as markdown w/ restored
// links, user verbatim) and the `presentField` tool-call, rendered as a field
// widget. `answered` = a later message exists, so the widget collapses to its
// label.
function renderParts(
  message: UIMessage,
  opts: {
    linkTokens?: LinkTokenMap;
    citations?: Citation[];
    answered: boolean;
    fieldLabels?: Record<string, string>;
    optionLabels?: Record<string, Record<string, string>>;
    onAnswer: (text: string) => void;
    onApprove: (id: string, approved: boolean) => void;
    onChange: (id: string, fieldLabel: string) => void;
  },
) {
  const isUser = message.role === "user";
  return (message.parts ?? []).map((part, i) => {
    if (part.type === "text" && part.content.trim()) {
      if (isUser) return <span key={i}>{part.content}</span>;
      const text = opts.linkTokens
        ? restoreLinks(part.content, opts.linkTokens)
        : part.content;
      return (
        <Markdown key={i} citations={opts.citations}>
          {text}
        </Markdown>
      );
    }
    const presented = presentedField(part);
    if (presented) {
      return (
        <FieldWidget
          key={i}
          spec={presented}
          messageId={message.id ?? String(i)}
          answered={opts.answered}
          onAnswer={opts.onAnswer}
        />
      );
    }
    const tc = part as {
      type: string;
      name?: string;
      state?: string;
      arguments?: string;
      approval?: { id: string };
    };
    if (tc.type === "tool-call" && tc.name === "presentChoices" && tc.arguments) {
      try {
        const args = JSON.parse(tc.arguments) as { choices?: string[] };
        if (Array.isArray(args.choices)) {
          return (
            <ChoicePrompt
              key={i}
              choices={args.choices}
              answered={opts.answered}
              onAnswer={opts.onAnswer}
            />
          );
        }
      } catch {
        // arguments still streaming — render nothing yet
      }
      return null;
    }
    if (
      tc.type === "tool-call" &&
      tc.name === "submitForm" &&
      tc.state === "approval-requested" &&
      tc.approval
    ) {
      const id = tc.approval.id;
      return (
        <ApprovalCard
          key={i}
          argsJson={tc.arguments}
          labels={opts.fieldLabels}
          valueLabels={opts.optionLabels}
          disabled={opts.answered}
          onRespond={(approved) => opts.onApprove(id, approved)}
          onChange={(label) => opts.onChange(id, label)}
        />
      );
    }
    return null;
  });
}

// A message renders an interactive control (a field widget or the approval
// card) rather than plain prose. Such messages stay their own bubble; only
// consecutive plain-text assistant messages get merged (see Messages).
function isInteractive(message: UIMessage): boolean {
  return (message.parts ?? []).some((p) => {
    if (presentedField(p)) return true;
    const tc = p as { type?: string; name?: string; state?: string };
    return (
      tc.type === "tool-call" &&
      ((tc.name === "submitForm" && tc.state === "approval-requested") ||
        tc.name === "presentChoices")
    );
  });
}

// The last turn is the assistant presenting a live field widget (a presentField
// with output), so the composer is the answer box — lets the page switch the
// placeholder to "Type your answer…".
export function awaitingFieldAnswer(
  messages: ReadonlyArray<UIMessage>,
): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  return (last.parts ?? []).some((p) => presentedField(p) !== null);
}

// The plain text of the latest assistant reply — its text parts joined, link
// tokens restored. For the off-screen aria-live region, so a screen reader
// hears the finished reply once (the caller passes "" while streaming).
export function latestAssistantText(
  messages: ReadonlyArray<UIMessage>,
  linkTokensByMessageId: Record<string, LinkTokenMap> = {},
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const tokens = m.id ? linkTokensByMessageId[m.id] : undefined;
    return (m.parts ?? [])
      .map((p) =>
        p.type === "text"
          ? tokens
            ? restoreLinks(p.content, tokens)
            : p.content
          : "",
      )
      .join("");
  }
  return "";
}

const noop = () => {};

// How close to the bottom (px) still counts as pinned to the latest message.
const SCROLL_END_THRESHOLD = 80;

export function Messages({
  messages,
  citationsByMessageId = {},
  linkTokensByMessageId = {},
  thinking = false,
  error = false,
  onAnswer = noop,
  onApprove = noop,
  onChange = noop,
  onReload = noop,
  onGiveFeedback = noop,
}: {
  messages: ReadonlyArray<UIMessage>;
  citationsByMessageId?: Record<string, Citation[]>;
  linkTokensByMessageId?: Record<string, LinkTokenMap>;
  /** Show the thinking indicator (turn in flight, assistant not yet replying). */
  thinking?: boolean;
  /** Show the error bubble as the last row (a turn failed). */
  error?: boolean;
  /** Send a field answer (pill click) as the next user message. */
  onAnswer?: (text: string) => void;
  /** Respond to a submitForm approval request (Submit / Cancel). */
  onApprove?: (id: string, approved: boolean) => void;
  /** Cancel a pending submit and re-ask a field (approval card Change link). */
  onChange?: (id: string, fieldLabel: string) => void;
  /** Re-run the failed turn (error bubble Try again). */
  onReload?: () => void;
  /** Start the feedback form (notice banner feedback link). */
  onGiveFeedback?: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { labels: fieldLabels, optionLabels } = collectFieldMeta(messages);

  // Flat row model so the virtualizer has a single `count`. Decorations
  // (welcome, thinking, error) share the list with message bubbles and carry
  // stable keys. Consecutive PLAIN-TEXT assistant messages from one turn still
  // merge into a single bubble (flush) — so a turn that narrates then answers
  // reads as one reply; interactive messages (widget / approval card) and user
  // messages flush the group and render on their own.
  const rows: Array<{ key: string; node: ReactNode }> = [
    {
      key: "notice",
      node: <NoticeBubble onGiveFeedback={onGiveFeedback} />,
    },
    { key: "welcome", node: <WelcomeBubble /> },
  ];
  let group: Array<{ node: ReactNode; key: string }> = [];
  const flush = () => {
    if (!group.length) return;
    const key = `grp-${group[0].key}`;
    rows.push({
      key,
      node: <AssistantBubble>{group.map((g) => g.node)}</AssistantBubble>,
    });
    group = [];
  };
  messages.forEach((m, i) => {
    const id = m.id;
    const tokens = id ? linkTokensByMessageId[id] : undefined;
    const citations = (id && citationsByMessageId[id]) || [];
    // A field widget is live only in the last message; once a later message
    // lands it's answered and collapses to its label.
    const answered = i < messages.length - 1;
    const rendered = renderParts(m, {
      linkTokens: tokens,
      citations,
      answered,
      fieldLabels,
      optionLabels,
      onAnswer,
      onApprove,
      onChange,
    });
    if (rendered.every((r) => r === null)) return;
    const key = String(id ?? i);
    if (m.role === "user") {
      flush();
      rows.push({ key, node: <UserBubble>{rendered}</UserBubble> });
      return;
    }
    if (isInteractive(m)) {
      flush();
      rows.push({ key, node: <AssistantBubble>{rendered}</AssistantBubble> });
      return;
    }
    group.push({ node: <Fragment key={key}>{rendered}</Fragment>, key });
  });
  flush();
  if (thinking && !error) {
    rows.push({ key: "thinking", node: <ThinkingBubble /> });
  }
  if (error) {
    rows.push({ key: "error", node: <ErrorBubble onRetry={onReload} /> });
  }

  // Virtualize the row list (TanStack Virtual). anchorTo:"end" + followOnAppend
  // keep the view pinned to the newest row as a reply streams in, but only when
  // the reader is already near the bottom (scrollEndThreshold). Bubbles are
  // dynamically measured, so variable-height markdown/widgets size correctly.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    getItemKey: (index) => rows[index]?.key ?? String(index),
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: SCROLL_END_THRESHOLD,
    overscan: 6,
  });

  // Jump to the latest row on mount, before paint — so a refresh with restored
  // history doesn't flash the transcript scrolled to the top.
  const didInitialScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (didInitialScrollRef.current || !parentRef.current) return;
    didInitialScrollRef.current = true;
    virtualizer.scrollToEnd();
  }, [virtualizer]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={parentRef}
        // overscroll-contain: the root layout renders the site footer BELOW
        // this scroll area (md+); without it, hitting the bottom chains the
        // scroll to the window and drags the footer into view.
        className="h-full overflow-y-auto overscroll-contain px-s py-s"
      >
        {/* Centered column matching the composer's max-w-2xl, so bubbles align
            with the input below them. */}
        <div
          aria-label="Chat messages"
          className="relative mx-auto w-full max-w-2xl"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-s"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {rows[virtualItem.index].node}
            </div>
          ))}
        </div>
      </div>

      {/* Derived in render so it stays correct as a reply streams — the
          virtualizer re-renders on scroll and re-measure. */}
      {!virtualizer.isAtEnd(SCROLL_END_THRESHOLD) && (
        <button
          type="button"
          aria-label="Jump to latest message"
          onClick={() => virtualizer.scrollToEnd({ behavior: "smooth" })}
          className="-translate-x-1/2 absolute bottom-xs left-1/2 z-10 rounded-full bg-blue-100 px-4 py-2 text-sm text-white-00 shadow-md"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}
