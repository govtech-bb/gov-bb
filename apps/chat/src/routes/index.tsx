import { createFileRoute, Link } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { BackButton, Button, Input, Logo, Text } from "@govtech-bb/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bubble } from "#/components/chat/bubble";
import { TridentAvatar } from "#/components/trident-avatar";
import { extractText, hasAnyToolCall } from "#/lib/chat/messages";
import type { Citation } from "#/lib/chat/types";
import { presentChoicesDef, submitFormDef } from "#/lib/chat-tools";

export const Route = createFileRoute("/")({ component: ChatPage });

function ChatPage() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Citations keyed by assistant messageId. Populated from the `citations`
  // custom event the server emits right after TEXT_MESSAGE_START.
  const [citationsByMessageId, setCitationsByMessageId] = useState<
    Record<string, Citation[]>
  >({});

  const connection = useMemo(() => fetchServerSentEvents("/api/chat"), []);

  const { messages, sendMessage, status, error, stop, addToolApprovalResponse } =
    useChat({
      connection,
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
        }
      },
    });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

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

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput("");
  }

  // Choice pills / approval buttons on a past assistant message become stale
  // once the user has answered (or the assistant has spoken again). Lock them
  // so the user can't fire a stale choice.
  function isHistoricalChoice(index: number): boolean {
    for (let i = index + 1; i < messages.length; i++) {
      const r = messages[i].role;
      if (r === "user" || r === "assistant") return true;
    }
    return false;
  }

  return (
    <div className="flex h-dvh flex-col bg-white-00">
      <SiteHeader />
      <ChatHeader />

      <main className="flex-1 overflow-y-auto px-s pb-s" ref={scrollRef}>
        <div className="mx-auto max-w-2xl space-y-s py-s">
          <WelcomeBubble />
          {messages.map((m, i) => (
            <Bubble
              key={m.id}
              message={m}
              onChoice={pickChoice}
              onApproval={onApproval}
              choicesDisabled={isHistoricalChoice(i)}
              citations={citationsByMessageId[m.id]}
            />
          ))}
          {shouldShowThinking(messages) && <ThinkingIndicator />}
          {error && (
            <div className="rounded-md bg-red-10 px-3 py-2 text-red-00 text-sm">
              {error.message}
            </div>
          )}
        </div>
      </main>

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

function ChatHeader() {
  return (
    <header className="bg-white-00">
      <div className="container flex items-center justify-between gap-s py-xm">
        <BackButton href="/">Back</BackButton>
        <TridentAvatar size="sm" tone="filled" />
      </div>
    </header>
  );
}

function WelcomeBubble() {
  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <div className="text-bubble rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-3 text-black-00 sm:px-5 sm:py-3.5">
        Welcome to <strong className="font-bold">alpha.gov.bb.</strong> I can
        help you find the right government service, understand what you need to
        apply, or point you to the right organisation. What would you like help
        with today?
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
    hasAnyToolCall([last], [presentChoicesDef.name, submitFormDef.name])
  ) {
    return false;
  }
  return true;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5">
      <TridentAvatar size="sm" tone="filled" />
      <span
        className="text-bubble animate-[shimmer_2.5s_linear_infinite] bg-clip-text font-medium text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--color-blue-40) 0%, var(--color-teal-00) 35%, var(--color-teal-100) 50%, var(--color-teal-00) 65%, var(--color-blue-40) 100%)",
          backgroundSize: "200% 100%",
        }}
      >
        Thinking
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
  const inputRef = useRef<HTMLInputElement>(null);
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
        <div className="flex w-full items-center gap-xs">
          <Input
            aria-label="Ask the government assistant"
            className="flex-1 text-black-00"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!streaming) onSubmit();
              }
            }}
            placeholder="Ask a question..."
            ref={inputRef}
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
