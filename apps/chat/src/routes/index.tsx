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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bubble } from "#/components/chat/bubble";
import { TridentAvatar } from "#/components/trident-avatar";
import { extractText, hasAnyToolCall } from "#/lib/chat/messages";
import {
  chatPersistence,
  citationsStore,
  getSessionThreadId,
} from "#/lib/chat/persistence";
import type { Citation } from "#/lib/chat/types";
import { presentChoicesDef, submitFormDef } from "#/lib/chat-tools";

export const Route = createFileRoute("/")({ component: ChatPage });

const MAX_QUERY_LENGTH = 2000;

// "Pinned to latest" tolerance (px). Within this of the bottom, streaming
// growth and appended messages keep the viewport stuck to the end.
const SCROLL_END_THRESHOLD = 80;

const LANDING_URL =
  import.meta.env.VITE_LANDING_URL || "https://landing.sandbox.alpha.gov.bb";

// Flat row model so the virtualizer has a single `count`. Decorations
// (welcome header, optimistic bubble, thinking indicator, error) live in the
// same list as messages and carry stable keys.
type ChatRow =
  | { kind: "welcome"; key: string }
  | { kind: "optimistic"; key: string; text: string }
  | { kind: "message"; key: string; message: UIMessage; index: number }
  | { kind: "thinking"; key: string }
  | { kind: "submitting"; key: string }
  | { kind: "error"; key: string; text: string };

function ChatPage() {
  const [input, setInput] = useState("");
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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

  // Screen-reader announcement of the COMPLETED assistant reply, surfaced via
  // the off-screen live region in the render. Guarding on isStreaming means we
  // announce the finished answer once, rather than reading out partial tokens
  // as they stream; the "Thinking" indicator (role="status") covers the
  // in-progress state.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (isStreaming) return;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    setAnnouncement(lastAssistant ? extractText(lastAssistant) : "");
  }, [isStreaming, messages]);

  const rows = useMemo<ChatRow[]>(() => {
    const out: ChatRow[] = [{ kind: "welcome", key: "welcome" }];
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
    // Anchor to the bottom: streaming growth and appended messages keep the
    // end pinned, and prepends (if added later) stay visually stable.
    anchorTo: "end",
    // Only follow new output when the reader is already near the bottom.
    followOnAppend: true,
    scrollEndThreshold: SCROLL_END_THRESHOLD,
    overscan: 6,
  });

  const autoSentRef = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount effect; sendMessage identity is irrelevant, autoSentRef guards re-entry.
  useEffect(() => {
    if (autoSentRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q")?.trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) return;
    autoSentRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState({}, "", url.toString());
    setPendingQuery(q);
    sendMessage(q);
  }, []);

  useEffect(() => {
    if (messages.length > 0) setPendingQuery(null);
  }, [messages.length]);

  // Start pinned to the latest message once the scroll element is live.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
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

  // Surface "Jump to latest" only while the reader has scrolled up off the end.
  // setState bails out when the boolean is unchanged, so this is cheap.
  const handleScroll = useCallback(() => {
    setShowJumpToLatest(!virtualizer.isAtEnd(SCROLL_END_THRESHOLD));
  }, [virtualizer]);

  function renderRow(row: ChatRow) {
    switch (row.kind) {
      case "welcome":
        return <WelcomeBubble />;
      case "optimistic":
        return <OptimisticUserBubble text={row.text} />;
      case "thinking":
        return <ThinkingIndicator />;
      case "submitting":
        return <ThinkingIndicator label="Submitting your application" />;
      case "error":
        // role="alert" so screen readers announce the failure. The raw
        // error (e.g. "Internal server error") is unhelpful to a citizen, so
        // show plain-language guidance and a retry that re-runs the failed
        // turn (useChat.reload — no duplicate user message).
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
        {/* Not a <main> — the root layout already provides the single main
            landmark. The transcript is deliberately NOT a live region: the
            virtualizer mounts/unmounts rows on scroll, which a live region
            announces as new content, re-reading history to screen readers.
            The working state and the completed reply are announced via the
            dedicated off-screen live region below. */}
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-s py-s"
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

        {/* Off-screen live region: announces the completed assistant reply
            once, decoupled from the virtualized transcript above. */}
        <div className="sr-only" aria-live="polite">
          {announcement}
        </div>

        {showJumpToLatest && (
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
          <GovLink href={LANDING_URL} external>
            Close
          </GovLink>
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
  if (hasAnyToolCall([last], [presentChoicesDef.name, submitFormDef.name])) {
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
      <span
        className="text-bubble animate-[shimmer_2.5s_linear_infinite] bg-clip-text font-medium text-transparent"
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
            <Button onClick={onStop} type="button">
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
