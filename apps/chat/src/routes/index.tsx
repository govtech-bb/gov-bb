import { createFileRoute, Link } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bubble } from "#/components/chat/bubble";
import { TridentAvatar } from "#/components/trident-avatar";
import { extractText, hasAnyToolCall } from "#/lib/chat/messages";
import { submitFormSession } from "#/lib/chat/submit-form";
import type { Source } from "#/lib/chat/types";
import { presentChoicesDef, submitFormDef } from "#/lib/chat-tools";

const SUGGESTIONS = [
  "How do I get a passport?",
  "How do I register a birth?",
  "What financial assistance is available?",
  "How do I apply for a driver's licence?",
];

export const Route = createFileRoute("/")({ component: ChatPage });

function ChatPage() {
  const [input, setInput] = useState("");
  // Map of "this is the Nth assistant message → these sources." Index-based,
  // not id-based, because @tanstack/ai sometimes re-keys streaming messages
  // mid-flight and the pill ends up stuck on the previous turn.
  const [sourcesByAssistantIndex, setSourcesByAssistantIndex] = useState<
    Source[][]
  >([]);
  const pendingSourcesQueueRef = useRef<Source[][]>([]);
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

  const empty = messages.length === 0;
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
    <div className="flex h-dvh flex-col bg-white">
      <header className="flex items-center justify-between border-grey-00 border-b px-4 py-3">
        <Link
          aria-label="Back to alpha.gov.bb"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-10 text-blue-100 transition-colors hover:bg-blue-40/30"
          to="/"
        >
          ←
        </Link>
        <span className="font-semibold text-black-00 text-sm">
          Ask alpha.gov.bb
        </span>
        <TridentAvatar size="sm" />
      </header>

      {empty ? (
        <EmptyState onPick={submit} />
      ) : (
        <main className="flex-1 overflow-y-auto px-4 pb-4" ref={scrollRef}>
          <div className="mx-auto max-w-2xl space-y-4 py-4">
            {messages.map((m, i) => (
              <Bubble
                key={m.id}
                message={m}
                onChoice={pickChoice}
                sources={sourcesForMessage(m, i)}
              />
            ))}
            {isStreaming && shouldShowThinking(messages) && <ThinkingShimmer />}
            {error && (
              <div className="rounded-md bg-red-10 px-3 py-2 text-red-00 text-sm">
                {error.message}
              </div>
            )}
          </div>
        </main>
      )}

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

function shouldShowThinking(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last) return false;
  if (last.role === "user") return true;
  return extractText(last).length === 0;
}

function ThinkingShimmer() {
  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <TridentAvatar size="sm" />
      <div className="rounded-[16px_16px_16px_4px] bg-blue-10 px-4 py-2.5 sm:px-5">
        <span
          className="animate-[shimmer_2.5s_linear_infinite] font-medium text-sm"
          style={{
            backgroundImage:
              "linear-gradient(90deg, var(--color-blue-40) 0%, var(--color-teal-00) 35%, var(--color-teal-100) 50%, var(--color-teal-00) 65%, var(--color-blue-40) 100%)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Thinking
        </span>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <TridentAvatar size="lg" />
      <h1 className="mt-6 font-bold text-4xl text-black-00 sm:text-5xl">
        Hello.
      </h1>
      <p className="mt-2 text-base text-mid-grey-00 sm:text-lg">
        What can we help you with today?
      </p>
      <div className="mt-8 flex w-full max-w-md flex-col gap-2.5 text-left">
        {SUGGESTIONS.map((s) => (
          <button
            className="group flex w-full items-center justify-between gap-3 rounded-xl border border-grey-00 bg-white px-4 py-3.5 text-black-00 text-sm transition-all hover:-translate-y-0.5 hover:border-teal-40 hover:shadow-[0_4px_16px_-8px_var(--color-teal-40)]"
            key={s}
            onClick={() => onPick(s)}
            type="button"
          >
            <span className="text-left">{s}</span>
            <span
              aria-hidden="true"
              className="text-mid-grey-00 transition-colors group-hover:text-teal-40"
            >
              →
            </span>
          </button>
        ))}
      </div>
    </main>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!streaming) textareaRef.current?.focus();
  }, [streaming]);

  const hasInput = input.trim().length > 0;

  return (
    <footer className="px-4 pb-4">
      <form
        className="relative mx-auto flex max-w-2xl flex-col rounded-3xl border border-grey-00 bg-white p-4 pr-16 shadow-[0_2px_16px_-4px_rgb(0_22_74/0.08)] transition-colors focus-within:border-blue-100"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          aria-label="Ask anything"
          className="max-h-48 min-h-12 w-full resize-none border-none bg-transparent text-black-00 text-sm placeholder:text-mid-grey-00 focus:outline-none"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask anything"
          ref={textareaRef}
          rows={2}
          value={input}
        />
        {streaming ? (
          <button
            aria-label="Stop generating"
            className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-mid-grey-00 text-white-00 transition-colors hover:bg-black-00"
            onClick={onStop}
            type="button"
          >
            <span
              aria-hidden="true"
              className="block h-3 w-3 rounded-sm bg-white-00"
            />
          </button>
        ) : (
          <button
            aria-label="Send"
            className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-teal-00 text-white-00 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:bg-grey-00 disabled:text-mid-grey-00"
            disabled={!hasInput}
            type="submit"
          >
            ↑
          </button>
        )}
      </form>
      <p className="mt-2 text-center text-mid-grey-00 text-xs">
        AI can make mistakes. Please double-check responses.
      </p>
    </footer>
  );
}
