import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bubble } from "#/components/chat/bubble";
import { TridentAvatar } from "#/components/trident-avatar";
import { extractText, hasAnyToolCall } from "#/lib/chat/messages";
import { prefillFormSession } from "#/lib/chat/prefill-form";
import type { Source } from "#/lib/chat/types";
import { validateFormFields } from "#/lib/chat/validate-fields";
import { openFormReviewDef, presentChoicesDef } from "#/lib/chat-tools";

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
  const pendingNavRef = useRef<string | null>(null);
  const lastFieldsByService = useRef<Map<string, Record<string, string>>>(
    new Map(),
  );

  const router = useRouter();

  const presentChoices = useMemo(
    () => presentChoicesDef.client(async () => ({ shown: true })),
    [],
  );
  const openFormReview = useMemo(
    () =>
      openFormReviewDef.client(async ({ service, fields }) => {
        const prior = lastFieldsByService.current.get(service) ?? {};
        const merged = { ...prior, ...fields };
        lastFieldsByService.current.set(service, merged);
        const result = await validateFormFields(service, merged);
        if (!result.ok) return { ok: false, errors: result.errors };
        try {
          const url = await prefillFormSession(service, merged);
          pendingNavRef.current = url;
          return { ok: true, redirectedTo: url };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unable to open review page";
          return { ok: false, errors: [{ field: "service", message }] };
        }
      }),
    [],
  );
  const tools = useMemo(
    () => [presentChoices, openFormReview],
    [presentChoices, openFormReview],
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
    pendingNavRef.current = null;
    stop();
  }, [stop]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    pendingNavRef.current = null;
    sendMessage(trimmed);
    setInput("");
  }

  const formFlowStartIdx = useMemo(() => {
    const formToolNames = [presentChoicesDef.name, openFormReviewDef.name];
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
    <div className="flex h-full flex-col">
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
      <h1 className="mt-6 font-bold text-4xl tracking-tight text-black-00 sm:text-5xl">
        Hello.
      </h1>
      <p className="mt-2 text-base text-mid-grey-00 sm:text-lg">
        What can we help you with today?
      </p>
      <div className="mt-8 flex w-full max-w-md flex-col gap-2 text-left">
        {SUGGESTIONS.map((s) => (
          <button
            className="group flex w-full items-center justify-between gap-3 rounded-xl border border-grey-00 bg-white-00 px-4 py-3.5 font-medium text-black-00 text-sm transition-colors hover:border-mid-grey-00 hover:bg-blue-10/40"
            key={s}
            onClick={() => onPick(s)}
            type="button"
          >
            <span className="text-left">{s}</span>
            <span
              aria-hidden="true"
              className="text-mid-grey-00 transition-colors group-hover:text-teal-00"
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
    <footer className="px-4 pt-3 pb-4 md:pt-4">
      <form
        className="relative mx-auto flex max-w-2xl flex-col rounded-3xl border border-grey-00 bg-white-00 p-4 pr-16 shadow-[0_1px_8px_-2px_rgb(0_22_74/0.06)] transition-colors focus-within:border-blue-100"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          aria-label="Ask anything"
          className="max-h-48 min-h-11 w-full resize-none border-none bg-transparent text-black-00 text-sm placeholder:text-mid-grey-00 focus:outline-none"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask anything"
          ref={textareaRef}
          rows={1}
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
