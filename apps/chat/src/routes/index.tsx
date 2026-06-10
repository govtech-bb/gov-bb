import { createFileRoute, Link } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Button,
  cn,
  Link as GovLink,
  linkVariants,
  Logo,
  Text,
  TextArea,
} from "@govtech-bb/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bubble } from "#/components/chat/bubble";
import { TridentAvatar } from "#/components/trident-avatar";
import { extractText, hasAnyToolCall } from "#/lib/chat/messages";
import {
  chatPersistence,
  citationsStore,
  getSessionThreadId,
  resetSessionThreadId,
} from "#/lib/chat/persistence";
import type { Citation } from "#/lib/chat/types";
import {
  askFieldDef,
  presentChoicesDef,
  reviewFormDef,
  submitFormDef,
} from "#/lib/chat-tools";

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

const LANDING_URL =
  import.meta.env.VITE_LANDING_URL || "https://landing.sandbox.alpha.gov.bb";

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
        const state = (data as { state?: string } | undefined)?.state;
        setSubmitting(state === "submitting");
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

  function renderRow(row: ChatRow) {
    switch (row.kind) {
      case "notice":
        return <NoticeBubble />;
      case "welcome":
        return <WelcomeBubble />;
      case "optimistic":
        return <OptimisticUserBubble text={row.text} />;
      case "thinking":
        return <ThinkingIndicator />;
      case "submitting":
        return <ThinkingIndicator label="Submitting your application" />;
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

function SiteHeader() {
  return (
    <div>
      <div className="bg-blue-100 text-white-00">
        <div className="container flex items-center gap-xs py-xs">
          <img
            alt=""
            aria-hidden="true"
            className="block"
            height={16}
            src="/coat-of-arms.png"
            width={17}
          />
          <Text as="span" className="text-white-00" size="caption">
            Official government website
          </Text>
        </div>
      </div>
      <header className="bg-yellow-100">
        <div className="container py-s md:py-m">
          <Link to="/" aria-label="Go to the alpha.gov.bb homepage">
            <Logo
              aria-hidden="true"
              width="auto"
              className="h-7 w-auto md:h-9"
            />
          </Link>
        </div>
      </header>
    </div>
  );
}

function ChatHeader({ onStartAgain }: { onStartAgain: () => void }) {
  return (
    <header className="bg-white-00">
      <div className="container flex items-center gap-s py-xm">
        <div className="flex-1">
          <GovLink href={LANDING_URL}>Close</GovLink>
        </div>
        <TridentAvatar size="sm" tone="filled" />
        <div className="flex flex-1 justify-end">
          <button
            type="button"
            onClick={onStartAgain}
            className={cn(linkVariants())}
          >
            Start again
          </button>
        </div>
      </div>
    </header>
  );
}

function OptimisticUserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="text-bubble max-w-[75%] rounded-[16px_16px_4px_16px] bg-blue-100 px-4 py-2.5 text-white-00">
        {text}
      </div>
    </div>
  );
}

// Beta disclaimer rendered as the first chat row, above the welcome bubble.
// Intentionally always shown — per product decision there is no dismiss or
// once-per-session suppression — and intentionally avatar-less: it is a
// standing disclaimer, not a message attributed to the assistant.
function NoticeBubble() {
  return (
    <div className="mb-xs flex max-w-[92%]">
      <Text
        as="p"
        size="caption"
        className="rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-2.5 text-mid-grey-00"
      >
        This assistant is new and still learning, so it may sometimes get things
        wrong. Please double check anything important.
      </Text>
    </div>
  );
}

function WelcomeBubble() {
  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <div className="text-bubble rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-3 text-black-00 sm:px-5 sm:py-3.5">
        Welcome to <strong>alpha.gov.bb.</strong> What would you like help with
        today?
      </div>
    </div>
  );
}

function shouldShowThinking(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last) return false;
  if (last.role === "user") return true;
  // Hide once something renderable lands: text deltas, a present_choices
  // tool call, or a submit_form approval prompt. set_field is invisible.
  if (extractText(last).length > 0) return false;
  if (
    hasAnyToolCall([last], [
      presentChoicesDef.name,
      askFieldDef.name,
      reviewFormDef.name,
      submitFormDef.name,
    ])
  ) {
    return false;
  }
  return true;
}

function ThinkingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    // role="status" announces the working state to screen readers; the
    // gradient text is otherwise visual-only.
    <div role="status" className="flex items-center gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      {/* motion-reduce disables the shimmer under prefers-reduced-motion; the
          gradient text stays legible static. */}
      <span
        className="text-bubble animate-[shimmer_2.5s_linear_infinite] bg-clip-text font-medium text-transparent motion-reduce:animate-none"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--color-blue-40) 0%, var(--color-teal-00) 35%, var(--color-teal-100) 50%, var(--color-teal-00) 65%, var(--color-blue-40) 100%)",
          backgroundSize: "200% 100%",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Composer({
  input,
  onChange,
  onSubmit,
  onStop,
  streaming,
}: {
  input: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  const hasInput = input.trim().length > 0;

  return (
    <footer className="px-s pb-s">
      <form
        className="mx-auto flex max-w-2xl flex-col items-center gap-xs"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex w-full items-end gap-xs">
          <TextArea
            aria-label="Ask the government assistant"
            className="composer-field flex-1 text-black-00"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) onSubmit();
              }
            }}
            placeholder="Ask a question..."
            ref={inputRef}
            rows={1}
            value={input}
          />
          {streaming ? (
            <Button
              aria-label="Stop generating the response"
              onClick={onStop}
              type="button"
            >
              Stop
            </Button>
          ) : (
            <Button disabled={!hasInput} type="submit">
              Send
            </Button>
          )}
        </div>
        <p className="text-disclaimer text-center text-mid-grey-00">
          Responses are based on official Government of Barbados information
        </p>
      </form>
    </footer>
  );
}
