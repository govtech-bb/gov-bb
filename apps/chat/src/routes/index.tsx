import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@govtech-bb/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bubble } from "#/components/chat/bubble";
import { ChatHeader, SiteHeader } from "#/components/chat/chrome";
import { Composer } from "#/components/chat/composer";
import {
  NoticeBubble,
  OptimisticUserBubble,
  ThinkingIndicator,
  WelcomeBubble,
} from "#/components/chat/static-bubbles";
import { TridentAvatar } from "#/components/trident-avatar";
import { FEEDBACK_TRIGGER_PHRASE } from "#/lib/chat/feedback-trigger";
import { extractText } from "#/lib/chat/messages";
import {
  chatPersistence,
  citationsStore,
  getSessionThreadId,
  resetSessionThreadId,
} from "#/lib/chat/persistence";
import { shouldShowThinking } from "#/lib/chat/thinking";
import type { Citation } from "#/lib/chat/types";

export const Route = createFileRoute("/")({
  component: ChatPage,
  // ?q= auto-sends a query handed over from the landing page's chat box.
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
});

const MAX_QUERY_LENGTH = 2000;

// How close to the bottom (px) still counts as pinned to the latest message.
const SCROLL_END_THRESHOLD = 80;

// Flat row model so the virtualizer has a single `count`. Decorations
// (welcome header, optimistic bubble, thinking indicator, error) live in the
// same list as messages and carry stable keys.
type ChatRow =
  | { kind: "notice"; key: string }
  | { kind: "welcome"; key: string }
  | { kind: "optimistic"; key: string; text: string }
  | { kind: "message"; key: string; message: UIMessage; index: number }
  | { kind: "thinking"; key: string }
  | { kind: "submitting"; key: string }
  | { kind: "error"; key: string; text: string };

function ChatPage() {
  const [input, setInput] = useState("");
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  // True between the submit_form tool's "submitting" and "submitted"/"failed"
  // custom events, so the UI can show progress during the blocking POST.
  const [submitting, setSubmitting] = useState(false);
  // Whether the in-flight submission is the feedback form, so the indicator can
  // read "Submitting your feedback" instead of "...your application". Only
  // meaningful while `submitting` is true; carried on the submit_status event.
  const [submittingIsFeedback, setSubmittingIsFeedback] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  // Citations keyed by assistant messageId. Populated from the `citations`
  // custom event the server emits right after TEXT_MESSAGE_START.
  const [citationsByMessageId, setCitationsByMessageId] = useState<
    Record<string, Citation[]>
  >(citationsStore.load);

  useEffect(() => {
    citationsStore.save(citationsByMessageId);
  }, [citationsByMessageId]);

  const connection = useMemo(() => fetchServerSentEvents("/api/chat"), []);

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    clear,
    reload,
    addToolApprovalResponse,
  } = useChat({
    id: "conversation",
    connection,
    persistence: chatPersistence,
    // useChat doesn't forward a `threadId` option to its ChatClient, so the
    // session's stable threadId rides in `body` (the server reads it from
    // forwardedProps) to keep the form session alive across refreshes.
    body: { threadId: getSessionThreadId() },
    onCustomEvent: (eventType, data) => {
      if (eventType === "citations") {
        const payload = data as
          | { messageId?: string; citations?: Citation[] }
          | undefined;
        if (payload?.messageId && Array.isArray(payload.citations)) {
          const id = payload.messageId;
          const cs = payload.citations;
          setCitationsByMessageId((prev) =>
            prev[id] ? prev : { ...prev, [id]: cs },
          );
        }
        return;
      }
      if (eventType === "submit_status") {
        const payload = data as
          | { state?: string; isFeedback?: boolean }
          | undefined;
        const isSubmitting = payload?.state === "submitting";
        setSubmitting(isSubmitting);
        if (isSubmitting) setSubmittingIsFeedback(payload?.isFeedback === true);
      }
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Safety net: clear the submitting indicator if a run ends without a
  // terminal submit_status event (e.g. the stream errors mid-POST).
  useEffect(() => {
    if (!isStreaming) setSubmitting(false);
  }, [isStreaming]);

  // Completed reply for the off-screen live region. Empty while streaming so
  // it announces once, not token-by-token. Derived in render (not an effect)
  // so it's present on first paint — aria-live ignores initial content, so a
  // refresh with history doesn't re-announce the last reply.
  const announcement = useMemo(() => {
    if (isStreaming) return "";
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    return lastAssistant ? extractText(lastAssistant) : "";
  }, [isStreaming, messages]);

  const rows = useMemo<ChatRow[]>(() => {
    const out: ChatRow[] = [
      { kind: "notice", key: "notice" },
      { kind: "welcome", key: "welcome" },
    ];
    if (pendingQuery && messages.length === 0) {
      out.push({ kind: "optimistic", key: "optimistic", text: pendingQuery });
      if (!error) out.push({ kind: "thinking", key: "thinking" });
    }
    messages.forEach((message, index) =>
      out.push({ kind: "message", key: message.id, message, index }),
    );
    if (submitting) {
      out.push({ kind: "submitting", key: "submitting" });
    } else if (!error && messages.length > 0 && shouldShowThinking(messages)) {
      out.push({ kind: "thinking", key: "thinking" });
    }
    if (error) out.push({ kind: "error", key: "error", text: error.message });
    return out;
  }, [messages, pendingQuery, error, submitting]);

  // Choice pills / approval buttons go stale once a later turn lands. A choice
  // is historical when a user/assistant message exists after it.
  const lastInteractiveIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const r = messages[i].role;
      if (r === "user" || r === "assistant") return i;
    }
    return -1;
  }, [messages]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    getItemKey: (index) => rows[index].key,
    // Keep the end pinned as the last bubble grows during streaming.
    anchorTo: "end",
    // Follow new output only when the reader is already near the bottom.
    followOnAppend: true,
    scrollEndThreshold: SCROLL_END_THRESHOLD,
    overscan: 6,
  });

  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    const query = q?.trim().slice(0, MAX_QUERY_LENGTH);
    if (!query) return;
    autoSentRef.current = true;
    // Strip ?q= so a refresh doesn't re-send; replace keeps history clean.
    void navigate({ search: {}, replace: true });
    setPendingQuery(query);
    sendMessage(query);
  }, [q, navigate, sendMessage]);

  useEffect(() => {
    if (messages.length > 0) setPendingQuery(null);
  }, [messages.length]);

  // Jump to the latest message on mount, before paint so there's no flash of
  // the transcript scrolled to the top.
  const didInitialScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (didInitialScrollRef.current || !parentRef.current) return;
    didInitialScrollRef.current = true;
    virtualizer.scrollToEnd();
  }, [virtualizer]);

  const pickChoice = useCallback(
    (choice: string) => {
      sendMessage(choice);
    },
    [sendMessage],
  );

  const onApproval = useCallback(
    (id: string, approved: boolean) => {
      void addToolApprovalResponse({ id, approved });
    },
    [addToolApprovalResponse],
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleStartAgain = useCallback(() => {
    stop();
    clear();
    // clear() only empties messages; rotating the threadId sheds the
    // server-side form session too.
    resetSessionThreadId();
    setCitationsByMessageId({});
    setPendingQuery(null);
    setSubmitting(false);
    setInput("");
    didInitialScrollRef.current = false;
  }, [stop, clear]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput("");
  }

  // The notice banner's inline "feedback" link starts the chat-feedback form the
  // same way the model's offer does — a matcher phrase the server pins. Manual
  // counterpart to offer_feedback; see #1066. No-op while streaming (sending is
  // disabled then), but the link stays visible — it never disappears on click.
  const handleGiveFeedback = useCallback(() => {
    if (isStreaming) return;
    sendMessage(FEEDBACK_TRIGGER_PHRASE);
  }, [isStreaming, sendMessage]);

  function renderRow(row: ChatRow) {
    switch (row.kind) {
      case "notice":
        return <NoticeBubble onGiveFeedback={handleGiveFeedback} />;
      case "welcome":
        return <WelcomeBubble />;
      case "optimistic":
        return <OptimisticUserBubble text={row.text} />;
      case "thinking":
        return <ThinkingIndicator />;
      case "submitting":
        return (
          <ThinkingIndicator
            label={
              submittingIsFeedback
                ? "Submitting your feedback"
                : "Submitting your application"
            }
          />
        );
      case "error":
        // role="alert" so it's announced. Plain-language guidance instead of
        // the raw error; reload() re-runs the failed turn without a dup.
        return (
          <div role="alert" className="flex max-w-[92%] items-start gap-2.5">
            <TridentAvatar size="sm" tone="filled" />
            <div className="flex min-w-0 flex-1 flex-col space-y-xs rounded-[16px_16px_16px_4px] bg-red-10 px-4 py-3 sm:px-5 sm:py-3.5">
              <p className="text-bubble font-semibold text-red-00">
                Something went wrong
              </p>
              <p className="text-bubble text-pretty text-black-00">
                We couldn&rsquo;t get a response. Please check your connection
                and try again.
              </p>
              <Button
                className="self-start"
                onClick={() => void reload()}
                type="button"
              >
                Try again
              </Button>
            </div>
          </div>
        );
      case "message":
        return (
          <Bubble
            message={row.message}
            onChoice={pickChoice}
            onApproval={onApproval}
            choicesDisabled={row.index < lastInteractiveIndex}
            citations={citationsByMessageId[row.message.id]}
          />
        );
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-white-00">
      <SiteHeader />
      <ChatHeader onStartAgain={handleStartAgain} />

      <div className="relative flex-1 overflow-hidden">
        {/* Not a live region: the virtualizer remounts rows on scroll, which a
            live region would re-announce as new. The reply is announced via the
            off-screen region below instead. */}
        <div
          ref={parentRef}
          // overscroll-contain: the root layout renders the site footer BELOW
          // this h-dvh page (md+), so without it, hitting the bottom of the
          // chat chains the scroll to the window and drags the footer into
          // view — recoverable only by scrolling the page itself back up.
          className="h-full overflow-y-auto overscroll-contain px-s py-s"
        >
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
                {renderRow(rows[virtualItem.index])}
              </div>
            ))}
          </div>
        </div>

        {/* Off-screen live region for the completed reply. */}
        <div className="sr-only" aria-live="polite">
          {announcement}
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

      <Composer
        input={input}
        onChange={setInput}
        onStop={handleStop}
        onSubmit={() => submit(input)}
        streaming={isStreaming}
      />
    </div>
  );
}

