import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { BackButton, Button, Input, Logo, Text } from "@govtech-bb/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bubble } from "#/components/chat/bubble";
import { TridentAvatar } from "#/components/trident-avatar";
import { extractText, hasAnyToolCall } from "#/lib/chat/messages";
import { submitFormSession } from "#/lib/chat/submit-form";
import type { Source } from "#/lib/chat/types";
import { presentChoicesDef, submitFormDef } from "#/lib/chat-tools";

export const Route = createFileRoute("/")({ component: ChatPage });

function ChatPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  // Map of "this is the Nth assistant message → these sources." Index-based,
  // not id-based, because @tanstack/ai sometimes re-keys streaming messages
  // mid-flight and the pill ends up stuck on the previous turn.
  const [sourcesByAssistantIndex, setSourcesByAssistantIndex] = useState<
    Source[][]
  >([]);
  const pendingSourcesQueueRef = useRef<Source[][]>([]);
  const pendingNavRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFieldsByService = useRef<Map<string, Record<string, string>>>(
    new Map(),
  );

  const presentChoices = useMemo(
    () => presentChoicesDef.client(async () => ({ shown: true })),
    [],
  );
  const submitForm = useMemo(
    () =>
      submitFormDef.client(async ({ service, fields }) => {
        const prior = lastFieldsByService.current.get(service) ?? {};
        const merged = { ...prior, ...fields };
        lastFieldsByService.current.set(service, merged);
        try {
          const result = await submitFormSession(service, merged);
          if (!result.ok) return { ok: false, errors: result.errors };
          return { ok: true, referenceNumber: result.referenceNumber };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unable to submit form";
          return { ok: false, errors: [{ field: "service", message }] };
        }
      }),
    [],
  );
  const tools = useMemo(
    () => [presentChoices, submitForm],
    [presentChoices, submitForm],
  );

  // useChat re-creates its ChatClient on every connection identity change;
  // construct once.
  const connection = useMemo(() => fetchServerSentEvents("/api/chat"), []);

  const { messages, sendMessage, status, error, stop } = useChat({
    connection,
    tools,
    onCustomEvent: (eventType, data) => {
      if (eventType === "sources") {
        pendingSourcesQueueRef.current.push(data as Source[]);
      }
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (isStreaming) return;
    const url = pendingNavRef.current;
    if (!url) return;
    pendingNavRef.current = null;
    router.navigate({ href: url });
  }, [isStreaming, router]);

  const last = messages.at(-1);

  // Indices (within `messages`) of each assistant message, in order.
  const assistantIndices = useMemo(
    () =>
      messages.reduce<number[]>((acc, m, i) => {
        if (m.role === "assistant") acc.push(i);
        return acc;
      }, []),
    [messages],
  );

  useEffect(() => {
    if (pendingSourcesQueueRef.current.length === 0) return;
    const count = assistantIndices.length;
    if (count === 0) return;
    // Assign queued sources to the Nth assistant message until caught up.
    if (sourcesByAssistantIndex.length >= count) return;
    const next = sourcesByAssistantIndex.slice();
    while (
      next.length < count &&
      pendingSourcesQueueRef.current.length > 0
    ) {
      const sources = pendingSourcesQueueRef.current.shift();
      if (!sources) break;
      next.push(sources);
    }
    if (next.length !== sourcesByAssistantIndex.length) {
      setSourcesByAssistantIndex(next);
    }
  }, [assistantIndices, sourcesByAssistantIndex]);

  const lastText = last ? extractText(last) : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll-on-grow trigger
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, lastText.length]);

  const pickChoice = useCallback(
    (choice: string) => {
      sendMessage(choice);
    },
    [sendMessage],
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

  const formFlowStartIdx = useMemo(() => {
    const formToolNames = [presentChoicesDef.name, submitFormDef.name];
    return messages.findIndex((m) => hasAnyToolCall([m], formToolNames));
  }, [messages]);

  function sourcesForMessage(
    m: UIMessage,
    index: number,
  ): Source[] | undefined {
    if (m.role !== "assistant") return;
    if (formFlowStartIdx !== -1 && index >= formFlowStartIdx) return;
    const assistantI = assistantIndices.indexOf(index);
    if (assistantI < 0) return;
    return sourcesByAssistantIndex[assistantI];
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
              sources={sourcesForMessage(m, i)}
            />
          ))}
          {isStreaming && shouldShowThinking(messages) && <ThinkingIndicator />}
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
  return extractText(last).length === 0;
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
